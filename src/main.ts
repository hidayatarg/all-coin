import * as  bodyParser from 'body-parser';
import * as express from 'express';

import { Block, generateNextBlock, getBlockchain, generateNextBlockWithTransaction, generateRawNextBlock, getAccountBalance } from './blockchain';
import { connectToPeers, getSockets, initP2PServer } from './p2p';
import { initWallet } from './wallet';

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = ( myHttpPort: number ) => {
    const app = express();
    app.use(bodyParser.json());

    app.use((err, req, res, next) => {
        if (err) {
            res.status(400).send(err.message)
        }
    });

    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });

    app.post('/mineBlock', (req, res) => {
        const newBlock: Block = generateNextBlock();
        if (newBlock === null) {
            res.status(400).send('Could not generate new block');
        } else {
            res.send(newBlock);
        }
    });

    app.post('/mineRawBlock', (req, res) => {
        if (req.body.data == null) {
            res.send('block data is missing');
            return;
        }

        const newBlock: Block = generateRawNextBlock(req.body.data);
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else{
            res.send(newBlock);
        }
    });

    app.get('/balance', (req, res) => {
        const balance: number = getAccountBalance();
        res.send({ 'balance': balance });
    });

    app.post('/mineTransaction', (req, res) => {
        const { address, amount } = req.body;
        try {
            const result = generateNextBlockWithTransaction(address, amount);
            res.send(result);
        } catch (err) {
            console.log(err.message);
            res.status(400).send(err.message);
        }
    });

    app.get('/peers', (req, res) => {
        res.send(getSockets().map(( s: any ) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    
    app.post('/addPeer', (req, res) => {
        connectToPeers(req.body.peer);
        res.send();
    });

    app.listen(myHttpPort, () => {
        console.log('Server Listening http on port: ' + myHttpPort);
    });
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
initWallet();