import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';

// ecdsa
const ec = new ecdsa.ec('secp256k1');

// coinbase transaction => inital transaction amount to start blockchain
// first transcation in the block => reward as an incetive for the miner
const COINBASE_AMOUNT: number = 50;


// Transaction Output
class TxOut {
    public address: string;
    public amount: number;

    constructor(address: string, amount: number) {
        this.address = address;
        this.amount = amount;
    }
}

// Transaction Input
class TxIn {
    public txOutId: string;
    public txOutIndex: number;
    public signature: string;
}

// Transaction Datastructure
class Transaction {
    public id: string;
    public txIns: TxIn[];
    public txOuts: TxOut[];
}

// Unspent Transaction Outputs
class UnspentTxOut {
    public readonly txOutId: string;
    public readonly txOutIndex: number;
    public readonly address: string;
    public readonly amount: number;

    constructor(txOutId: string, txOutIndex: number, address: string, amount: number) {
        this.txOutId = txOutId;
        this.txOutIndex = txOutIndex;
        this.address = address;
        this.amount = amount;
    }
}

// TransactionId
const getTransactionId = (transaction: Transaction): string => {
    const txInContent: string = transaction.txIns
        .map((txIn: TxIn) => txIn.txOutId + txIn.txOutIndex)
        .reduce((a, b) => a + b, '');

    const txOutContent: string = transaction.txOuts
        .map((txOut: TxOut) => txOut.address + txOut.amount)
        .reduce((a, b) => a + b, '');
    // return the transactionId made from TransactionInputContent and TransactionOutputContent
    return CryptoJS.SHA256(txInContent + txOutContent).toString();
}

// Transaction Signature
// Transaction cannot be altered, after it has been signed
// const signTxIn = (transaction: Transaction, txInIndex: number,
//     privateKey: string, inputUnspentTxOuts: UnspentTxOut[]): string => {
//     const txIn: TxIn = transaction.txIns[txInIndex];
//     const dataToSign = transaction.id;
//     const referencedUnspentTxOut: UnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, inputUnspentTxOuts);
//     const referencedAddress = referencedUnspentTxOut.address;
//     const key = ec.keyFromPrivate(privateKey, 'hex');
//     const signature: string = toHexString(key.sign(dataToSign).toDER());
//     return signature;
// };

// ** when a new block is added to the chain
// we must update our list of unspent transaction outputs.
// new transactions will spend some of the existing transaction outputs and introduce new unspent outputs

const updateUnspentTxOuts = (newTranscations: Transaction[], unspentTxOuts: UnspentTxOut[]): UnspentTxOut[] => {
    const newUnspentTxOuts: UnspentTxOut[] = newTranscations
        .map((t) => {
            return t.txOuts.map((txOut, index) => new UnspentTxOut(t.id, index, txOut.address, txOut.amount));
        })
        .reduce((a, b) => a.concat(b), []);

    // Transaction outputs are spent by the new transactions of the block
    const consumedTxOuts: UnspentTxOut[] = newTranscations
        .map((t) => t.txIns)
        .reduce((a, b) => a.concat(b), [])
        .map((txIn) => new UnspentTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

    // Generate the new unspent transaction outputs
    const resultingUnspentTxOuts = unspentTxOuts
        .filter(((utxOutput) => !findUnspentTxOut(utxOutput.txOutId, utxOutput.txOutIndex, consumedTxOuts)))
        .concat(newUnspentTxOuts);

    return resultingUnspentTxOuts;
};

const processTransactions = (transactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number) => {
    if (!isValidTransactionsStructure(transactions)) {
        return null;
    }

    if (!validateBlockTransactions(transactions, aUnspentTxOuts, blockIndex)) {
        console.log('invalid block transactions');
        return null;
    }
    return updateUnspentTxOuts(transactions, aUnspentTxOuts);
}


const findUnspentTxOut = (transactionId: string, index: number, unspentTxOuts: UnspentTxOut[]): UnspentTxOut => {
    return unspentTxOuts.find((uTxO) => uTxO.txOutId === transactionId && uTxO.txOutIndex === index);
};

const getTxInAmount = (txIn: TxIn, unspentTxOuts: UnspentTxOut[]): number => {
    return findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, unspentTxOuts).amount;
};

const getCoinbaseTransaction = (address: string, blockIndex: number): Transaction => {
    const t = new Transaction();
    const txIn: TxIn = new TxIn();

    txIn.signature = "";
    txIn.txOutId = "";
    txIn.txOutIndex = blockIndex;

    t.txIns = [txIn];
    t.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
    t.id = getTransactionId(t);
    // transaction
    return t;
}

const signTxIn = (transaction: Transaction, txInIndex: number, privateKey: string, aUnspentTxOuts: UnspentTxOut[]): string => {
    const txIn: TxIn = transaction.txIns[txInIndex];

    const dataToSign = transaction.id;

    const referencedUnspentTxOut: UnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts);
    if (referencedUnspentTxOut == null) {
        console.log('Could not find the reference txOut');
        throw Error();
    }

    const referencedAddress = referencedUnspentTxOut.address;

    if (getPublicKey(privateKey) !== referencedAddress) {
        console.log('trying to sign an input with private key that does not match the address that is referenced in txIn');
        throw Error();
    }
    const key = ec.keyFromPrivate(privateKey, 'hex');
    const signature: string = toHexString(key.sign(dataToSign).toDER());

    return signature;
}

const getPublicKey = (privateKey: string): string => {
    // TODO: false in here is added intentionally
    return ec.keyFromPrivate(privateKey, 'hex').getPublic().encode('hex', false);
};

const toHexString = (byteArray): string => {
    return Array.from(byteArray, (byte: any) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
};

//____________________________________Transaction Validation__________________________________

const isValidTransactionStructure = (transaction: Transaction) => {
    if (typeof transaction.id !== 'string') {
        console.log('Transaction id missing');
        return false;
    }
    // check other class members too here
    // transaction must be correctly calculated
    // if (getTransactionId(transaction) !== transaction.id) {
    //     console.log('invalid coinbase transaction id: ' + transaction.id);
    //     return false;
    // }
    // TODO: update this

    if (!(transaction.txIns instanceof Array)) {
        console.log('invalid txIns type in transaction');
        return false;
    }
    if (!transaction.txIns
            .map(isValidTxInStructure)
            .reduce((a, b) => (a && b), true)) {
        return false;
    }

    if (!(transaction.txOuts instanceof Array)) {
        console.log('invalid txIns type in transaction');
        return false;
    }

    if (!transaction.txOuts
            .map(isValidTxOutStructure)
            .reduce((a, b) => (a && b), true)) {
        return false;
    }
    return true;
}


const isValidTransactionsStructure = (transactions: Transaction[]): boolean => {
    return transactions
        .map(isValidTransactionStructure)
        .reduce((a, b) => (a && b), true);
};

// validate transaction Input
// signatures in the transactionInputs must be valid and the outputs must not be spent
const validateTxIn = (txIn: TxIn, transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {
    const referencedUTxOut: UnspentTxOut = aUnspentTxOuts.find((uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex);

    if (referencedUTxOut == null) {
        console.log('Referenced Transaction Output not Found: ', JSON.stringify(txIn));
        return false;
    }
    const address = referencedUTxOut.address;
    const key = ec.keyFromPublic(address, 'hex');

    const validSignature: boolean = key.verify(transaction.id, txIn.signature);
    if (!validSignature) {
        console.log(`Invalid txIn signature: ${txIn.signature} txId: ${transaction.id} address: ${referencedUTxOut.address}`);

        return false;
    }
    return true;
};



const validateTransaction = (transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {

    if (getTransactionId(transaction) !== transaction.id) {
        console.log('invalid tx id: ' + transaction.id);
        return false;
    }
    const hasValidTxIns: boolean = transaction.txIns
        .map((txIn) => validateTxIn(txIn, transaction, aUnspentTxOuts))
        .reduce((a, b) => a && b, true);

    if (!hasValidTxIns) {
        console.log('some of the txIns are invalid in tx: ' + transaction.id);
        return false;
    }

    // validate transaction output
    // sum of values in output must be equal to sum of values in input
    // reference output = 50 coin 
    const totalTxInValues: number = transaction.txIns
        .map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
        .reduce((a, b) => (a + b), 0);

    const totalTxOutValues: number = transaction.txOuts
        .map((txOut) => txOut.amount)
        .reduce((a, b) => (a + b), 0);

    if (totalTxOutValues !== totalTxInValues) {
        console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction.id);
        return false;
    }

    return true;
};

const validateBlockTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number): boolean => {
    const coinbaseTx = aTransactions[0];
    if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
        console.log('Invalid coinbase transaction: ', JSON.stringify(coinbaseTx));
        return false;
    }

    // check duplicate transcation input
    // each transaction input must be included once

    const txIns: TxIn[] = _(aTransactions)
        .map(tx => tx.txIns)
        .flatten()
        .value();

    if (hasDuplicates(txIns)) {
        return false;
    }

    // not for coinbase transactions
    const normalTransactions: Transaction[] = aTransactions.slice(1);
    return normalTransactions
        .map(tx => validateTransaction(tx, aUnspentTxOuts))
        .reduce((a, b) => (a && b), true);
}

const hasDuplicates = (txIns: TxIn[]): boolean => {
    const groups = _.countBy(txIns, (txIn: TxIn) => txIn.txOutId + txIn.txOutIndex);
    return _(groups)
        .map((value, key) => {
            if (value > 1) {
                console.log('duplicate txIn: ', key);
                return true;
            } else {
                return false;
            }
        })
        .includes(true);
}


// validation of the coinbase transaction differs the validation of a normal transaction
const validateCoinbaseTx = (transaction: Transaction, blockIndex: number): boolean => {
    if (transaction == null) {
        console.log('the first transaction in the block must be coinbase transaction');
        return false;
    }
    if (getTransactionId(transaction) !== transaction.id) {
        console.log('invalid coinbase tx id: ' + transaction.id);
        return false;
    }
    if (transaction.txIns.length !== 1) {
        console.log('one txIn must be specified in the coinbase transaction');
        return;
    }
    if (transaction.txIns[0].txOutIndex !== blockIndex) {
        console.log('the txIn index in coinbase tx must be the block height');
        return false;
    }
    if (transaction.txOuts.length !== 1) {
        console.log('invalid number of txOuts in coinbase transaction');
        return false;
    }
    if (transaction.txOuts[0].amount !== COINBASE_AMOUNT) {
        console.log('invalid coinbase amount in coinbase transaction');
        return false;
    }
    return true;
};

// validate transation input structure
const isValidTxInStructure = (txIn: TxIn): boolean => {
    if (txIn == null) {
        console.log('txIn is null');
        return false;
    } else if (typeof txIn.signature !== 'string') {
        console.log('invalid signature type in txIn');
        return false;
    } else if (typeof txIn.txOutId !== 'string') {
        console.log('invalid txOutId type in txIn');
        return false;
    } else if (typeof  txIn.txOutIndex !== 'number') {
        console.log('invalid txOutIndex type in txIn');
        return false;
    } else {
        return true;
    }
};

// validate transation output structure
const isValidTxOutStructure = (txOut: TxOut): boolean => {
    if (txOut == null) {
        console.log('txOut is null');
        return false;
    } else if (typeof txOut.address !== 'string') {
        console.log('invalid address type in txOut');
        return false;
    } else if (!isValidAddress(txOut.address)) {
        console.log('invalid TxOut address');
        return false;
    } else if (typeof txOut.amount !== 'number') {
        console.log('invalid amount type in txOut');
        return false;
    } else {
        return true;
    }
};

// valid address => ecdsa public key in the 04 + X-coordinate + Y-coordinate format
const isValidAddress = (address: string): boolean => {
    if (address.length !== 130) {
        console.log('invalid public key length');
        return false;
    } else if (address.match('^[a-fA-F0-9]+$') === null) {
        console.log('public key must contain only hex characters');
        return false;
    } else if (!address.startsWith('04')) {
        console.log('public key must start with 04');
        return false;
    }
    return true;
};

export { 
    processTransactions, 
    getTransactionId,
    signTxIn, 
    UnspentTxOut, 
    TxIn, 
    TxOut, 
    getCoinbaseTransaction,
    getPublicKey,
    Transaction,
    isValidAddress
}