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
