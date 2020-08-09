import { ec } from 'elliptic';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as _ from 'lodash';
import { 
    getPublicKey, 
    getTransactionId, 
    signTxIn, 
    Transaction, 
    TxIn, TxOut, 
    UnspentTxOut 
} from './transaction';

const EC = new ec('secp256k1');

// Generate an unencrypted private key to the file in following address
const privateKeyLocation = 'node/wallet/private_key';

const generatePrivateKey = (): string => {
    const keyPair = EC.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};

const initWallet = () => {
    // let's not override existing private keys
    if (existsSync(privateKeyLocation)) {
        return;
    }
    const newPrivateKey = generatePrivateKey();

    writeFileSync(privateKeyLocation, newPrivateKey);
    console.log('new wallet with private key is created successfully.');
};

// Address can be calculated from the private key
const getPublicFromWallet = (): string => {
    const privateKey = getPrivateFromWallet();
    const key = EC.keyFromPrivate(privateKey, 'hex');
    return key.getPublic().encode('hex');
};

// Storing the private key in an unencrypted format is unsafe. 
// TODO: Only for the purpose to keep things simple for now
const getPrivateFromWallet = (): string => {
    const buffer = readFileSync(privateKeyLocation, 'utf8');
    return buffer.toString();
};

// Wallet balance

// Calculating the balance for a given address
// When you own some coins in the blockchain, => a list of unspent transaction outputs
// Public key matches to the private key you own
const getBalance = (address: string, unspentTxOuts: UnspentTxOut[]): number => {
    // sum all the unspent transaction by that address
    return _(unspentTxOuts)
        .filter((uTxO: UnspentTxOut) => uTxO.address === address)
        .map((uTxO: UnspentTxOut) => uTxO.amount)
        .sum();
};

// Generating transactions
// Create the transaction inputs. 
// Loop through our unspent transaction outputs until the sum of these outputs is greater or equal than the amount we want to send
const findTxOutsForAmount = (amount: number, myUnspentTxOuts: UnspentTxOut[]) => {
    let currentAmount = 0;
    const includedUnspentTxOuts = [];
    for (const myUnspentTxOut of myUnspentTxOuts) {
        includedUnspentTxOuts.push(myUnspentTxOut);
        currentAmount = currentAmount + myUnspentTxOut.amount;
        if (currentAmount >= amount) {
            const leftOverAmount = currentAmount - amount;
            // we will also calculate the leftOverAmount which is the value we will send back to our address
            return {includedUnspentTxOuts, leftOverAmount};
        }
    }
    throw Error('not enough coins to send transaction');
};

const createTxOuts = (receiverAddress: string, myAddress: string, amount, leftOverAmount: number) => {
    const txOut1: TxOut = new TxOut(receiverAddress, amount);
    if (leftOverAmount === 0) {
        return [txOut1];
    } else {
        const leftOverTx = new TxOut(myAddress, leftOverAmount);
        return [txOut1, leftOverTx];
    }
};

const createTransaction = (receiverAddress: string, amount: number, privateKey: string, unspentTxOuts: UnspentTxOut[]): Transaction => {

    const myAddress: string = getPublicKey(privateKey);
    const myUnspentTxOuts = unspentTxOuts.filter((uTxO: UnspentTxOut) => uTxO.address === myAddress);

    const {includedUnspentTxOuts, leftOverAmount} = findTxOutsForAmount(amount, myUnspentTxOuts);

    const toUnsignedTxIn = (unspentTxOut: UnspentTxOut) => {
        const txIn: TxIn = new TxIn();
        txIn.txOutId = unspentTxOut.txOutId;
        txIn.txOutIndex = unspentTxOut.txOutIndex;
        return txIn;
    };
    
    // list of unspent transaction outputs, we can create the txIns
    const unsignedTxIns: TxIn[] = includedUnspentTxOuts.map(toUnsignedTxIn);

    const tx: Transaction = new Transaction();
    tx.txIns = unsignedTxIns;
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
    tx.id = getTransactionId(tx);

    tx.txIns = tx.txIns.map((txIn: TxIn, index: number) => {
        txIn.signature = signTxIn(tx, index, privateKey, unspentTxOuts);
        return txIn;
    });

    return tx;
};

export {
    createTransaction, 
    getPublicFromWallet,
    getPrivateFromWallet, 
    getBalance, 
    generatePrivateKey, 
    initWallet
};