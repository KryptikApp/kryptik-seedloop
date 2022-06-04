import { Provider, TransactionRequest } from "@ethersproject/abstract-provider";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { BytesLike, arrayify } from "@ethersproject/bytes";
import { SigningKey } from "@ethersproject/signing-key";
import { Keypair} from '@solana/web3.js'
import * as bitcoin from 'bitcoinjs-lib'
import * as nacl from "tweetnacl";
import { SignedTransaction } from ".";
// import * as ecc from 'tiny-secp256k1';
// import { ECPairFactory,} from 'ecpair';




import { defaultNetworks, Network, NetworkInfo, NetworkInfoDict, NetworkFamily } from "./network"
import { WalletEthers } from "./walletEthers";



export interface TransactionParameters{
    evmTransaction?:TransactionRequest,
    btcTransaction?:bitcoin.Psbt,
    solTransactionBuffer?:Uint8Array
}


export class WalletKryptik extends WalletEthers{
    // set default chainId... can also be set via the constructor
    public readonly chainId:number = 60
    public readonly addressKryptik:string;
    // wallet network family... set default as evm
    public networkFamily:NetworkFamily = NetworkFamily.EVM;
    

    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, network?:Network, provider?: Provider) {
        super(privateKey, provider);
        if(network==null){
            network = defaultNetworks.eth
        }
        let chainId = network.chainId;
        // if chainId is provided... set as wallet coin type
        if(chainId!=null){
            this.chainId = chainId
        }
        this.networkFamily = network.networkFamily;
        // sets address for wallet
        this.addressKryptik = this.generateAddress(this.publicKey, this.privateKey)
    }

    // sign tx.
    // TODO: add handling for range of types that can be returned... currently assuming this is handled by user of func.
    async signKryptikTransaction(txParams:TransactionParameters): Promise<SignedTransaction> {
        let signedTx:SignedTransaction = {};
        switch(this.networkFamily){
            case NetworkFamily.EVM :{
                // ensure evm tx. was passed in
                if(!txParams.evmTransaction) throw Error("EVM transaction not provided.");
                // use default signer implemented by ethers wallet
                signedTx.evmFamilyTx = await this.signTransaction(txParams.evmTransaction);
                return signedTx;
            }
            case NetworkFamily.Bitcoin :{
                // btcTransaction.signInput(0, pk)
                // ensure btc tx. was passed in
                if(!txParams.btcTransaction) throw Error("BTC transaction not provided.");
                signedTx.bitcoinFamilyTx = await this.signBtcTransaction(txParams.btcTransaction);
                return signedTx;
            }
            case NetworkFamily.Solana:{
                // ensure sol tx. was passed in
                if(!txParams.solTransactionBuffer) throw Error("Sol transaction not provided.");
                signedTx.solanaFamilyTx = await this.signSolMessage(txParams.solTransactionBuffer);
                return signedTx;
            }
            default:{
                throw Error(`Network of type: ${this.chainId} signatures not yet supported.`)
            }
        }
    }

    // signs btc family transaction
    async signBtcTransaction(btcTransaction:bitcoin.Psbt){
        throw Error("Bitcoin tx. signature not implemented yet.")
        return btcTransaction;
        // console.log(btcTransaction);
        // const privKeyBuffer:Buffer = Buffer.from(arrayify(this.privateKey));
        // const ECPair = ECPairFactory(ecc);
        // // create eckey from privkey buffer
        // let ecKey = ECPair.fromPrivateKey(privKeyBuffer);
        // // sign btc transaction
        // btcTransaction.signInput(0, ecKey);
        // // create validator for btc transaction
        // const validator = (
        //     pubkey: Buffer,
        //     msghash: Buffer,
        //     signature: Buffer,
        //   ): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);
        // // validate signature 
        // btcTransaction.validateSignaturesOfInput(0, validator);
        // return btcTransaction;
        
    }

    // can sign data OR transaction!
    async signSolMessage(solTransactionBuffer:Uint8Array):Promise<Uint8Array>{
        // ensure wallet has associated pk
        if(!this.privateKey) throw Error("No private key found when signing sol transaction. Ensure wallet has been properly instantiated.");
        // create key buffers
        let privKeyArray:Uint8Array = arrayify(this.privateKey);
        let pubKeyArray:Uint8Array = arrayify(this.publicKey);
        // create sol signature
        let solSignature:Uint8Array = nacl.sign.detached(solTransactionBuffer, privKeyArray);
        // verify signature
        let solSigVerified:Boolean = nacl.sign.detached.verify(solTransactionBuffer, solSignature, pubKeyArray)
        if(!solSigVerified) throw Error("Sol signature verification failed");
        return solSignature;
    }

    // if coin type is of ethereum family... just use default ethers implementation
    // else... create and set address
    generateAddress(publicKey:string, privKey:string):string{
        if(this.networkFamily == NetworkFamily.EVM){
            // use default address created by ethers wallet
            return this.address;
        }
        if(this.networkFamily == NetworkFamily.Bitcoin){
            return this.generateBitcoinFamilyAddress(publicKey)
        }
        if(this.networkFamily == NetworkFamily.Solana){
            return this.generateSolanaFamilyAddress(privKey);
        }
        throw(Error(`Unable to generate address for wallet with network type: ${this.chainId}`));
    }

    // returns address for coins in the solana family
    generateSolanaFamilyAddress = function(privKey:string):string{
        let privKeyArray:Uint8Array = arrayify(privKey);
        let solKeypair = Keypair.fromSeed(privKeyArray);
        return solKeypair.publicKey.toString();
    }

    // generates address for networks within the bitcoin family
    generateBitcoinFamilyAddress(pubKey:string):string{
        const pubKeyBuffer:Buffer = Buffer.from(arrayify(pubKey));
        const LITECOIN = {
            messagePrefix: '\x19Litecoin Signed Message:\n',
            bech32: 'ltc',
            bip32: {
              public: 0x019da462,
              private: 0x019d9cfe,
            },
            pubKeyHash: 0x30,
            scriptHash: 0x32,
            wif: 0xb0,
        };
        const DOGECOIN = {
            messagePrefix: '\x19Dogecoin Signed Message:\n',
            bech32: 'doge',
            bip32: {
              public: 0x02FACAFD,
              private: 0x02FAC398,
            },
            pubKeyHash: 0x1E,
            //TODO: fix script and wif bytes
            scriptHash: 0x32,
            wif: 0xb0,
        }
        let addressToreturn:string = "not set";
        switch(this.chainId){
            case 0:{
                const payment = bitcoin.payments.p2pkh({ pubkey:pubKeyBuffer, network:bitcoin.networks.bitcoin });
                if(payment.address) return payment.address;
                break;
            }
            case 2:{
                const payment = bitcoin.payments.p2pkh({ pubkey: pubKeyBuffer , network:LITECOIN});
                if(payment.address) return payment.address;
                break;
            }
            case 3:{
                const payment = bitcoin.payments.p2pkh({ pubkey: pubKeyBuffer , network:DOGECOIN});
                if(payment.address) return payment.address;
                break;
            }
            default:{
                throw(Error(`Error: coin type ${this.chainId} is not specified within the bitcoin network family.`));   
            }
        }
        return addressToreturn;
    }

    // returns chain family
    getNetworkFamily = function(chainId:number):NetworkFamily{
        for (let ticker in NetworkInfoDict) {
            let NetworkInfo:NetworkInfo = NetworkInfoDict[ticker];
            // match chainId
            if(NetworkInfo.chainCode == chainId){
                return NetworkInfo.networkFamily
            }
        }
        // if we got this far, something went wrong
        return NetworkFamily.EVM;
    }


}