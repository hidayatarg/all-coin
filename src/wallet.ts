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
const privateKeyLocation = process.env.PRIVATE_KEY || 'node/wallet/private_key';

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
    console.log(`new wallet with private key is created successfully at: ${privateKeyLocation}`);
};

const deleteWallet = () => {
    if (existsSync(privateKeyLocation)) {
        unlinkSync(privateKeyLocation);
    }
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
    return _(findUnspentTxOuts(address, unspentTxOuts))
        .map((uTxO: UnspentTxOut) => uTxO.amount)
        .sum();
};

const findUnspentTxOuts = (ownerAddress: string, unspentTxOuts: UnspentTxOut[]) => {
    return _.filter(unspentTxOuts, (uTxO: UnspentTxOut) => uTxO.address === ownerAddress);
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

    const errMessage = `Cannot create transaction from the available unspent transaction outputs. Required amount: ${amount}, Available unspentTxOuts: ${JSON.stringify(myUnspentTxOuts)}`;
    throw Error(errMessage);
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

const createTransaction = (receiverAddress: string, amount: number, privateKey: string, unspentTxOuts: UnspentTxOut[], 
                           txPool: Transaction[]
): Transaction => {
    console.log(`Transcation Pool: ${JSON.stringify(txPool)}`);

    const myAddress: string = getPublicKey(privateKey);
    const myUnspentTxOuts_ = unspentTxOuts.filter((uTxO: UnspentTxOut) => uTxO.address === myAddress);

    // Unspend Transcation Outputs
    const myUnspentTxOuts = filterTxPoolTxs(myUnspentTxOuts_, txPool);

    // filter from unspentOutputs such inputs that are referenced in pool

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

    // Return Transactions
    return tx;
};

const filterTxPoolTxs = (unspentTxOuts: UnspentTxOut[], transactionPool: Transaction[]): UnspentTxOut[] => {
    const txIns: TxIn[] = _(transactionPool)
        .map((tx: Transaction) => tx.txIns)
        .flatten()
        .value();
    
        const removable: UnspentTxOut[] = [];
    
    for (const unspentTxOut of unspentTxOuts) {
        const txIn = _.find(txIns, (aTxIn: TxIn) => {
            return aTxIn.txOutIndex === unspentTxOut.txOutIndex && aTxIn.txOutId === unspentTxOut.txOutId;
        });

        if (txIn === undefined) {
            //
        } else {
            removable.push(unspentTxOut);
        }
    }

    return _.without(unspentTxOuts, ...removable);
};


export {
    createTransaction, 
    getPublicFromWallet,
    getPrivateFromWallet, 
    getBalance, 
    generatePrivateKey, 
    initWallet,
    deleteWallet,
    findUnspentTxOuts
};