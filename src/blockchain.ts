import * as _ from 'lodash';
import * as CryptoJS from 'crypto-js';
import { broadcastLatest, broadcastTransactionPool } from './p2p';
import { hexToBinary } from './utils';
// transactions
import { UnspentTxOut, Transaction, processTransactions, getCoinbaseTransaction, isValidAddress } from './transactions';
import{ createTransaction, getBalance, getPublicFromWallet, getPrivateFromWallet, findUnspentTxOuts } from './wallet';
import { getTransactionPool, addToTransactionPool, updateTransactionPool } from './transactionPool';

// Block Structure
class Block {
    public index: number;
    public hash: string;
    public previousHash: string;
    public timestamp: number;
    public data: Transaction[];
    public difficulty: number;
    public nonce: number;

    constructor(index: number, hash: string, previousHash: string, timestamp: number, data: Transaction[], difficulty: number, nonce: number) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}

const genesisTransaction = {
    'txIns': [{'signature': '', 'txOutId': '', 'txOutIndex': 0}],
    'txOuts': [{
        'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
        'amount': 50
    }],
    'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
};

// The First Block of Chain
const genesisBlock: Block = new Block(
    0,
    '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627',
    '',
    1465151705,
    [genesisTransaction],
    0,
    0
);

// Block Chain
let blockchain: Block[] = [genesisBlock];

// Unspent Transaction Outputs
let unspentTxOuts: UnspentTxOut[] = processTransactions(blockchain[0].data, [], 0);

// GET BlockChain => return block array
const getBlockchain = (): Block[] => blockchain;

// GET Unspent Transactions
const getUnspentTxOuts = (): UnspentTxOut[] => _.cloneDeep(unspentTxOuts);

// TransactionPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut: UnspentTxOut[]) => {
    console.log('replacing unspentTxouts with: ', newUnspentTxOut);
    unspentTxOuts = newUnspentTxOut;
};

// GET the Last Block
const getLatestBlock = (): Block => blockchain[blockchain.length - 1];

// PoW Implementation
// seconds
const BLOCK_GENERATION_INTERVAL: number = 10;

// blocks
const DIFFICULTY_ADJUSTMENT_INTERVAL: number = 1000;

const getDifficulty = (inputBlockchain: Block[]): number => {
    const latestBlock: Block = inputBlockchain[blockchain.length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0
        && latestBlock.index !== 0) {
        return getAdjustDifficulty(latestBlock, inputBlockchain)
    } else {
        return latestBlock.difficulty;
    }
}

const getAdjustDifficulty = (latestBlock: Block, inputBlockchain: Block[]) => {
    const previousAdjustmentBlock: Block = inputBlockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken: number = latestBlock.timestamp - previousAdjustmentBlock.timestamp;

    if (timeTaken < timeExpected / 2) {
        return previousAdjustmentBlock.difficulty + 1;
    } else if (timeTaken > timeExpected * 2) {
        return previousAdjustmentBlock.difficulty - 1
    } else {
        return previousAdjustmentBlock.difficulty;
    }
}

const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

const calculateHashForBlock = (block: Block): string =>
    calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index: number, previousHash: string, timestamp: number, data: Transaction[], difficulty: number, nonce: number): string =>
    CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

// Validate the Block Structure
const isValidBlockStructure = (block: Block): boolean => {
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'object';
};

// Validate New Block Return Boolean
const isValidNewBlock = (newBlock: Block, previousBlock: Block): boolean => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid structure: ', JSON.stringify(newBlock));
        return false;
    }
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    } else if (!hasValidHash(newBlock)) {
        console.log('invalid hash');
        return false;
    }

    return true;
};

// Validate the chain
// Returns the unspent txOuts if the chain is valid
const isValidChain = (blockchainToValidate: Block[]): UnspentTxOut[] => {
    console.log(`The chain to validate: ${JSON.stringify(blockchainToValidate)}`);
    const isValidGenesis = (block: Block): boolean => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };

    if (!isValidGenesis(blockchainToValidate[0])) {
        return null;
    }

    // Validate each block in the chain. 
    // The block is valid if the block structure is valid and the transaction are valid
    let aUnspentTxOuts: UnspentTxOut[] = [];

    for (let i = 1; i < blockchainToValidate.length; i++) {
        const currentBlock: Block = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }

        aUnspentTxOuts = processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === null) {
            console.log('Invalid transactions in blockchain');
            return null;
        }
    }
    return aUnspentTxOuts;
};

// Add a block to chain
const addBlockToChain = (newBlock: Block): boolean => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        const retVal: UnspentTxOut[] = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);

        if (retVal == null) {
            console.log('Transactions in the block is not valid');
            return false;
        } else {
            blockchain.push(newBlock);
            setUnspentTxOuts(retVal);
            updateTransactionPool(unspentTxOuts);
            return true;
        }
    }
  
    return false;
};

// Get the longest blockchain
const replaceChain = (newBlocks: Block[]) => {
    const aUnspentTxOuts = isValidChain(newBlocks);
    const validChain: boolean = aUnspentTxOuts !== null;
    if (validChain
        && getAccumulatedDifficulty(newBlocks) >
        getAccumulatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        updateTransactionPool(unspentTxOuts);
        broadcastLatest();
    } else {
        console.log('Received blockchain invalid');
    }
};

// Generate the next block
// Update according to PoW
const generateRawNextBlock = (blockData: Transaction[]) => {
    const previousBlock: Block = getLatestBlock();
    const nextIndex: number = previousBlock.index + 1;
    const nextTimestamp: number = getCurrentTimestamp();
    // const nextHash: string = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    const difficulty: number = getDifficulty(getBlockchain());
    console.log('block difficulty: ', difficulty);

    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
   // broadcastLatest block if add to the chain
    if (addBlockToChain(newBlock)) {
        broadcastLatest();
        return newBlock;
    } else {
        return null;
    }
};

// GET Unspent transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
    return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};

const generateNextBlock = () => {
    // initial transaction
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    // first gensis block
    const blockData: Transaction[] = [coinbaseTx].concat(getTransactionPool());
    return generateRawNextBlock(blockData);
};

const generateNextBlockWithTransaction = (receiverAddress: string, amount: number) => {
    // check the reciver Address and amount type
    if (!isValidAddress(receiverAddress)) {
        throw new Error('Invalid Address');
    }

    if (typeof amount !== 'number') {
        throw new Error('Invalid Amount');
    }
    const cointbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    const blockData: Transaction[] = [cointbaseTx, tx];
    return generateRawNextBlock(blockData);
};

const getAccountBalance = (): number => {
    return getBalance(getPublicFromWallet(), getUnspentTxOuts());
}

const sendTransaction = (address: string, amount: number): Transaction => {
    const tx: Transaction = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    addToTransactionPool(tx, getUnspentTxOuts());
    broadcastTransactionPool();
    return tx;
}


const findBlock = (index: number, peviousHash: string, timestamp: number, data: Transaction[], difficulty: number): Block => {
    let nonce = 0;
    while (true) {
        const hash: string = calculateHash(index, peviousHash, timestamp, data, difficulty, nonce);
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, peviousHash, timestamp, data, difficulty, nonce);
        }
        // if hash difficulty doesnt match increas the nonce
        nonce++;
    }
}

const hashMatchesDifficulty = (hash: string, difficulty: number): boolean => {
    const hashInBinary: string = hexToBinary(hash);
    const requirePrefix: string = '0'.repeat(difficulty);
    return hashInBinary.startsWith(requirePrefix);
}

// check the block content
const hashMatchesBlockContent = (block: Block): boolean => {
    const blockHash: string = calculateHashForBlock(block);
    return blockHash === block.hash;
}

const hasValidHash = (block: Block): boolean => {
    if (!hashMatchesBlockContent(block)) {
        console.log('Invalid Hash, hash: ', block.hash);
        return false;
    }

    if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('Block Difficulty not Satisfied. Expected: ', block.difficulty, ' but found: ', block.hash);
    }

    return true;
}

const isValidTimestamp = (newBlock: Block, previousBlock: Block): boolean => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp)
        && newBlock.timestamp - 60 < getCurrentTimestamp();
}

const getAccumulatedDifficulty = (inputBlockchain: Block[]): number => {
    return inputBlockchain
        .map(block => block.difficulty)
        .map(difficulty => Math.pow(2, difficulty))
        // a previous value, b current value
        .reduce((a, b) => a + b);
}

const handleReceivedTransaction = (transaction: Transaction) => {
    addToTransactionPool(transaction, getUnspentTxOuts());
}

export { 
    Block, 
    getBlockchain, 
    getLatestBlock, 
    isValidBlockStructure, 
    addBlockToChain, 
    replaceChain, 
    generateNextBlock, 
    generateRawNextBlock, 
    generateNextBlockWithTransaction, 
    getAccountBalance,
    handleReceivedTransaction,
    getUnspentTxOuts,
    sendTransaction,
    getMyUnspentTransactionOutputs
};