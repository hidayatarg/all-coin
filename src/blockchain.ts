import * as CryptoJS from 'crypto-js';
import { broadcastLatest } from './p2p';
import { convertHexToBinary } from './utils';
import { UnspentTxOut, Transaction, processTransactions, getCoinbaseTransaction, isValidAddress } from './transaction';
import { createTransaction, getBalance, getPrivateFromWallet, getPublicFromWallet } from './wallet';

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

// The First Block of Chain
const genesisBlock: Block = new Block(
    0,
    '816534932c2b7154242da6afc367695e6337db8a921823784c14378abed4f7d7',
    '',
    1465151705,
    [],
    0,
    0
);

// Unspent transaction output
// Can be derived from the current blockchain
let unspentTxOuts: UnspentTxOut[] = [];

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

// GET BlockChain => return block array
const getBlockchain = (): Block[] => blockchain;

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
        console.log('invalid structure');
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

// Validate the chain
const isValidChain = (blockchainToValidate: Block[]): boolean => {
    const isValidGenesis = (block: Block): boolean => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };

    if (!isValidGenesis(blockchainToValidate[0])) {
        return false;
    }

    for (let i = 1; i < blockchainToValidate.length; i++) {
        if (!isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return false;
        }
    }
    return true;
};

// Add a block to chain
const addBlockToChain = (newBlock: Block): boolean => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {

        const retunValue: UnspentTxOut[] = processTransactions(newBlock.data, unspentTxOuts, newBlock.index);
        if (retunValue === null) {
            return false;
        } else {
            blockchain.push(newBlock);
            unspentTxOuts = retunValue;
            return true;
        }
    }
    return false;
};

// Get the longest blockchain
const replaceChain = (newBlocks: Block[]) => {
    if (isValidChain(newBlocks) 
        && getAccumlatedDifficulty(newBlocks) > getAccumlatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
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
    const blockData: Transaction[] = [coinbaseTx];
    return generateRawNextBlock(blockData);
}

const  generatenextBlockWithTransaction = (receiverAddress: string, amount: number) => {
    if (!isValidAddress(receiverAddress)) {
        throw Error('invalid reciver address!');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), unspentTxOuts);
    const blockData: Transaction[] = [coinbaseTx, tx];
    return generateRawNextBlock(blockData);
}

const getAccountBalance = (): number => {
    return getBalance(getPublicFromWallet(), unspentTxOuts);
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
    getAccountBalance
};