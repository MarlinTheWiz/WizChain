'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];


class Block{

    /**
     * The Basic structure of each block consists of 
     * @param {Number} index 
     * @param {String} previousHash (the hash of the previous block must be found in the block to preserve the chain integrity)
     * @param {Date} timestamp 
     * @param {*} data (information that needed to be stored in the block)
     * @param {String} hash 
     */
    constructor(index, previousHash, timestamp, data, hash){
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

/**
 * 
 * The block needs to be hashed to keep the integrity of the data.
 * This hash has nothing to do with "mining" because there is no Proof of Work problem to solve
 * 
 * @param {Number} index 
 * @param {String} previousHash 
 * @param {Date} timestamp 
 * @param {*} data 
 */
var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

/**
 * To generate a block we must know the hash of the previous block and create the rest of the required content
 * Block Data is provided easily by the user
 * 
 * @param {*} blockData 
 */
var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};

// The first block of the Blockchain is called the Genesis Block
var getGenesisBlock = () => {
    var date = new Date().getTime() / 1000;
    return new Block(0, "0", date, "Genesis Block", calculateHash(0, "0", date, "Genesis Block"));
};

// A in-memory Javascript array is used to store the blockchain
var blockchain = [getGenesisBlock()];

/**
 * Function to Validate the Integrity of Blocks
 * Should be able to validate a block or chain of blocks at any given moment
 * Especially when we receive new blocks from other nodes and must decide whether to accept them or not
 * 
 * @param {Block} newBlock 
 * @param {Block} previousBlock 
 */
var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 != newBlock.index){
        console.log("Invalid Index");
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log("Invalid Previous Hash");
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash){
        console.log("Invalid Hash, it is " + newBlock.hash + " when it should be " + calculateHashForBlock(newBlock));
        return false;
    }
    return true;
};

/**
 * Function to choose block with longest chain
 * Should always be only one explicit set of blocks in the chain at a given time. 
 * In case of conflicts (e.g. two nodes both generate block number 72) 
 * we choose the chain that has the longest number of blocks.
 * @param {Block} newBlocks 
 */
var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

/**
 * Communicating with other nodes:
 * An essential part of a node is to share and sync the blockchain with other nodes. 
 * The following rules are used to keep the network in sync.
 * When a node generates a new block, it broadcasts it to the network
 * When a node connects to a new peer it querys for the latest block
 * When a node encounters a block that has an index larger than the current known block, 
 * it either adds the block the its current chain or querys for the full blockchain.
 */

 /**
  * Controlling the node
  * The user must be able to control the node in some way. This is done by setting up a HTTP server.
  */
var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.post('/mineBlock', (req, res) => {
        var newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

/**
 * As seen, the user is able to interact with the node in the following ways:
 * List all blocks
 * Create a new block with a content given by the user
 * List or add peers
 * 
 * The most straightforward way to control the node is e.g. with Curl:
 * #get all blocks from the node
 * curl http://localhost:3001/blocks
 */

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();