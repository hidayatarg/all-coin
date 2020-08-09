import * as _ from 'lodash';
import {Transaction, TxIn, UnspentTxOut, validateTransaction} from './transaction';
// Tx => transactions
// Store our unconfirmed transactions
let transactionPool: Transaction[] = [];

const getTransactionPool = () => {
    return _.cloneDeep(transactionPool);
};

// Add Transcation to Pool
const addToTransactionPool = (tx: Transaction, unspentTxOuts: UnspentTxOut[]) => {

    if (!validateTransaction(tx, unspentTxOuts)) {
        throw Error('Trying to add invalid tx to pool');
    }

    if (!isValidTxForPool(tx, transactionPool)) {
        throw Error('Trying to add invalid tx to pool');
    }
    console.log(`adding to txPool: ${JSON.stringify(tx)}`);
    transactionPool.push(tx);
};
const updateTransactionPool = (unspentTxOuts: UnspentTxOut[]) => {
    const invalidTxs = [];
    for (const tx of transactionPool) {
        for (const txIn of tx.txIns) {
            if (!hasTxIn(txIn, unspentTxOuts)) {
                invalidTxs.push(tx);
                break;
            }
        }
    }
    if (invalidTxs.length > 0) {
        console.log('removing the following transactions from txPool: %s', JSON.stringify(invalidTxs));
        transactionPool = _.without(transactionPool, ...invalidTxs);
    }
};

const hasTxIn = (txIn: TxIn, unspentTxOuts: UnspentTxOut[]): boolean => {
    const foundTxIn = unspentTxOuts.find((uTxO: UnspentTxOut) => {
        return uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex;
    });
    return foundTxIn !== undefined;
};

const getTxPoolIns = (transactionPool: Transaction[]): TxIn[] => {
    return _(transactionPool)
        .map((tx) => tx.txIns)
        .flatten()
        .value();
};

const isValidTxForPool = (tx: Transaction, transactionPool: Transaction[]): boolean => {
    const txPoolIns: TxIn[] = getTxPoolIns(transactionPool);

    const containsTxIn = (txIns: TxIn[], txIn: TxIn) => {
        return _.find(txPoolIns, ((txPoolIn) => {
            return txIn.txOutIndex === txPoolIn.txOutIndex && txIn.txOutId === txPoolIn.txOutId;
        }));
    };

    for (const txIn of tx.txIns) {
        if (containsTxIn(txPoolIns, txIn)) {
            console.log('transaction input already found in the transaction pool!');
            return false;
        }
    }
    return true;
};

export {
    addToTransactionPool, 
    getTransactionPool, 
    updateTransactionPool
};