import * as CryptoJS from 'crypto-js';
import { broadcastLatest } from './p2p';
import { hexToBinary } from './utils'

// Block Structure
class Block {
    public index: number;
    public hash: string;
    public previousHash: string;
    public timestamp: number;
    public data: string;
    public difficulty: number;
    public nonce: number;

    constructor(index: number, hash: string, previousHash: string, timestamp: number, data: string, difficulty: number, nonce: number) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}

// The First Block of Chain
const genesisBlock: Block = new Block(
    0,
    '816534932c2b7154242da6afc367695e6337db8a921823784c14378abed4f7d7',
    '',
    1465151705,
    'Genesis Block!!',
    0,
    0
);

// Block Chain
let blockchain: Block[] = [genesisBlock];

// GET BlockChain => return block array
const getBlockchain = (): Block[] => blockchain;

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

const calculateHash = (index: number, previousHash: string, timestamp: number, data: string, difficulty: number, nonce: number): string =>
    CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

// Validate the Block Structure
const isValidBlockStructure = (block: Block): boolean => {
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'string';
};

// Validate New Block Return Boolean
const isValidNewBlock = (newBlock: Block, previousBlock: Block): boolean => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid structure');
        return false;
    }
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};

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
const addBlockToChain = (newBlock: Block) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
        return true;
    }
    return false;
};

// Get the longest blockchain
const replaceChain = (newBlocks: Block[]) => {
    if (isValidChain(newBlocks) && newBlocks.length > getBlockchain().length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcastLatest();
    } else {
        console.log('Received blockchain invalid');
    }
};

// Generate the next block
// Update according to PoW
const generateNextBlock = (blockData: string) => {
    const previousBlock: Block = getLatestBlock();
    const nextIndex: number = previousBlock.index + 1;
    const nextTimestamp: number = getCurrentTimestamp();
    // const nextHash: string = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    const difficulty: number = getDifficulty(getBlockchain());
    console.log('block difficulty: ', difficulty);

    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty)
    addBlockToChain(newBlock);
    broadcastLatest();
    return newBlock;
};

const findBlock = (index: number, peviousHash: string, timestamp: number, data: string, difficulty: number): Block => {
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

export { Block, getBlockchain, getLatestBlock, isValidBlockStructure, addBlockToChain, replaceChain, generateNextBlock };