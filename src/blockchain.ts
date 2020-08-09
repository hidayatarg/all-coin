import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import { broadcastLatest, broadCastTransactionPool } from './p2p';
import { convertHexToBinary } from './utils';
import { UnspentTxOut, Transaction, processTransactions, getCoinbaseTransaction, isValidAddress } from './transaction';
import { createTransaction, getBalance, getPrivateFromWallet, getPublicFromWallet, findUnspentTxOuts } from './wallet';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';

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
        this.nonce = nonce;
        this.difficulty = difficulty;
    }
}

const genesisTransactionBlock = {
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
    '816534932c2b7154242da6afc367695e6337db8a921823784c14378abed4f7d7',
    '',
    1465151705,
    [genesisTransactionBlock],
    0,
    0
);


// Block Generation Interval in seconds
const BLOCK_GENERATION_INTERVAL: number = 10;

// Difficulty Adjust in blocks
const DIFFICULTY_ADJUSTMENT_INTERVAL: number = 10;

const getDifficulty = (BlockChain: Block[]) : number => {
    const latestBlock: Block = BlockChain[blockchain.length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(latestBlock, blockchain);
    }
    return latestBlock.difficulty;
}

const getNonce = (): number => {
    return 0;
}

// Adjust Difficulty
const getAdjustedDifficulty = (latestBlock: Block, BlockChain: Block []) => {
    const previousAdjustmentBlock: Block = BlockChain[blockchain.length - 1];
    const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken: number = latestBlock.timestamp - previousAdjustmentBlock.timestamp;
    if (timeTaken < timeExpected / 2) {
        return previousAdjustmentBlock.difficulty + 1;
    } else if (timeTaken > timeExpected * 2) {
        return previousAdjustmentBlock.difficulty - 1;
    } else {
        return previousAdjustmentBlock.difficulty;
    }
}

// Timestamp
const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

// Block Chain
let blockchain: Block[] = [genesisBlock];

// Unspent transaction output
// Can be derived from the current blockchain
// the unspent transcation output of genesis block is set to unspentTxOuts on startup
let unspentTxOuts: UnspentTxOut[] = processTransactions(blockchain[0].data, [], 0);

// GET BlockChain => return block array
const getBlockchain = (): Block[] => blockchain;

// GET UnspendTranscationOutputs
const getUnspentTxOuts = (): UnspentTxOut[] => _.cloneDeep(unspentTxOuts);

//  Transcation Pool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut: UnspentTxOut[]) => {
    console.log(`replacing unspentTxouts with: ${newUnspentTxOut}`);
    unspentTxOuts = newUnspentTxOut;
};

// GET the unspend transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
    return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};

// GET the Last Block
const getLatestBlock = (): Block => blockchain[blockchain.length - 1];

const calculateHashForBlock = (block: Block): string =>
    calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index: number, previousHash: string, timestamp: number, data: Transaction[], difficulty: number, nonce: number): string =>
    CryptoJS.SHA256(index + previousHash + timestamp + data).toString();

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
        console.log(`invalid block structure: ${JSON.stringify(newBlock)}`);
        console.log('incomming block: ', newBlock)
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
    }
    else if (!hasValidHash(newBlock)) {
        return false
    }
    return true;
};

// Valid timestamp
const isValidTimestamp = (newBlock: Block, previousBlock: Block): boolean => {
    const validity = (previousBlock.timestamp - 60 < newBlock.timestamp) 
                    && newBlock.timestamp - 60 < getCurrentTimestamp();
    return validity;
}

// Valid hash
const hasValidHash = (block: Block) => {
    if (!hashMatchesBlockContent(block)) {
        console.log('invalid hash : ', block.hash);
        return false;
    }

    if(!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('invalid block difficulty. Expected: ' + block.difficulty + 'Recived: ' + block.hash);
        return true;
    }
};

const hashMatchesBlockContent = (block: Block) : boolean => {
    const blockHash: string = calculateHashForBlock(block);
    return blockHash === block.hash;
}

// Validate the blockchain
// If the given blockchain is valid. 
// Return the unspent transaction output if the chain is valid
const isValidChain = (blockchainToValidate: Block[]): UnspentTxOut[] => {
    console.log(`invalid blockchain : ${JSON.stringify(blockchainToValidate)}`);
    const isValidGenesis = (block: Block): boolean => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };

    if (!isValidGenesis(blockchainToValidate[0])) {
        return null;
    }

    let unspentTxOuts_: UnspentTxOut[] = [];

    // Validate each block in the chain. 
    // The block is valid if the block structure is valid and the transaction are valid
    for (let i = 1; i < blockchainToValidate.length; i++) {
        const currentBlock: Block = blockchainToValidate[i];

        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }

        unspentTxOuts_ = processTransactions(currentBlock.data, unspentTxOuts_, currentBlock.index);
        if (unspentTxOuts_ === null) {
            console.log('invalid transactions in blockchain');
            return null;
        }
    }
    return unspentTxOuts_;
};

// Add a block to chain
const addBlockToChain = (newBlock: Block): boolean => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {

        const returnValue: UnspentTxOut[] = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (returnValue === null) {
            console.log('invalid block in term of transactions');
            return false;
        } else {
            blockchain.push(newBlock);
            setUnspentTxOuts(returnValue);
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
    if (validChain && isValidChain(newBlocks) 
        && getAccumlatedDifficulty(newBlocks) > getAccumlatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        updateTransactionPool(unspentTxOuts);
        broadcastLatest();
    } else {
        console.log('Received blockchain invalid');
    }
};

const getAccumlatedDifficulty = (BlockChain: Block[]): number => {
    return BlockChain
        .map(block => block.difficulty)
        .map(difficulty => Math.pow(2, difficulty))
        .reduce((a,b) => a + b);
};

// Generate the next block
const generateRawNextBlock = (blockData: Transaction[]) => {
    const previousBlock: Block = getLatestBlock();
    const nextIndex: number = previousBlock.index + 1;
    const nextTimestamp: number = getCurrentTimestamp();
    const difficulty: number = getDifficulty(getBlockchain());
    const nonce: number = getNonce();
    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if(addBlockToChain(newBlock)) {
        broadcastLatest();
        return newBlock;
    } else {
        return null;
    }
};

const generateNextBlock = () => {
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const blockData: Transaction[] = [coinbaseTx].concat(getTransactionPool());
    return generateRawNextBlock(blockData);
}

const generatenextBlockWithTransaction = (receiverAddress: string, amount: number) => {
    if (!isValidAddress(receiverAddress)) {
        throw Error('invalid reciver address!');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    const blockData: Transaction[] = [coinbaseTx, tx];
    return generateRawNextBlock(blockData);
}

// GET Account Balance
const getAccountBalance = (): number => {
    return getBalance(getPublicFromWallet(), getUnspentTxOuts());
};

// Send Transaction
const sendTransaction = (address: string, amount: number): Transaction => {
    // tx => transcation
    const tx: Transaction = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    addToTransactionPool(tx, getUnspentTxOuts());
    broadCastTransactionPool();
    return tx;
}

// ADD Transaction to the Transaction Pool
const handleReceivedTransaction = (transaction: Transaction) => {
    addToTransactionPool(transaction, getUnspentTxOuts());
};

const findBlock = (index: number, previousHash: string, timestamp: number, data: Transaction[], difficulty: number): Block => {
    let nonce = getNonce();
    while(true) {
        const hash: string = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
        }
        nonce++;
    }
};

const hashMatchesDifficulty = (hash: string, difficulty: number): boolean => {
    const hashInBinary: string = convertHexToBinary(hash);
    const requirePerfix: string = '0'.repeat(difficulty);
    console.log('require Prefix: ', requirePerfix);
    // add zeros to the front
    return hashInBinary.startsWith(requirePerfix);  
};

export { 
    Block, 
    getBlockchain, 
    getLatestBlock, 
    isValidBlockStructure, 
    addBlockToChain, 
    replaceChain, 
    generateRawNextBlock,
    generateNextBlock,
    generatenextBlockWithTransaction,
    getAccountBalance,
    getUnspentTxOuts,
    sendTransaction,
    handleReceivedTransaction, 
    getMyUnspentTransactionOutputs,
};