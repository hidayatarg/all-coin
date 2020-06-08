import * as CryptoJS from 'crypto-js';


// Block Structure
class Block {
    public index: number;
    public hash: string;
    public previousHash: string;
    public timestamp: number;
    public data: string;

    constructor(index: number, hash: string, previousHash: string, timestamp: number, data: string) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
    }
}

// The First Block of Chain
const genesisBlock: Block = new Block(
    0,
    '816534932c2b7154242da6afc367695e6337db8a921823784c14378abed4f7d7',
    '',
    1465151705,
    'Genesis Block!!'
);

// Block Chain
let blockchain: Block[] = [genesisBlock];

// GET BlockChain => return block array
const getBlockchain = (): Block[] => blockchain;

// GET the Last Block
const getLatestBlock = (): Block => blockchain[blockchain.length - 1];

export { Block, getBlockchain, getLatestBlock };