import { Provider, TransactionRequest } from "@ethersproject/abstract-provider";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { BytesLike, arrayify } from "@ethersproject/bytes";
import { SigningKey } from "@ethersproject/signing-key";
import { Keypair } from "@solana/web3.js";
import * as bitcoin from 'bitcoinjs-lib'
import * as nacl from "tweetnacl";
import { SignedTransaction } from ".";
// import * as ecc from 'tiny-secp256k1';
// import { ECPairFactory,} from 'ecpair';


import { defaultNetworks, Network, NetworkFamily } from "./network"
import { WalletEthers } from "./walletEthers";



export interface TransactionParameters{
    evmTransaction?:TransactionRequest,
    btcTransaction?:bitcoin.Psbt,
    transactionBuffer?:Uint8Array
}


export class WalletKryptik extends WalletEthers{
    // set default chainId... can also be set via the constructor
    public readonly chainId:number = 60
    // tikcer of network this wallet belongs to
    public readonly addressKryptik:string;
    // wallet network family... set default as evm
    public networkFamily:NetworkFamily = NetworkFamily.EVM;
    // warapping private key in getter prevents leak in console
    private _ed25519PrivateKey: ()=>Uint8Array|null;
    

    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, network:Network, provider?: Provider, ed25519rivateKey?:Uint8Array) {
        super(privateKey, provider);
        if(network==null){
            network = defaultNetworks.eth
        }
        let chainId = network.chainId;
        // if chainId is provided... set as wallet coin type
        if(chainId!=null){
            this.chainId = chainId
        }
        this._ed25519PrivateKey = () => {return ed25519rivateKey?ed25519rivateKey:null};
        this.networkFamily = network.networkFamily;
        // sets address for wallet
        this.addressKryptik = this.generateAddress()
        this.address = this.generateAddress();
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
                if(!txParams.transactionBuffer) throw Error("Sol transaction not provided.");
                signedTx.solanaFamilyTx = await this.signSolMessage(txParams.transactionBuffer);
                return signedTx;
            }
            case NetworkFamily.Near:{
                // ensure near tx. was passed in
                if(!txParams.transactionBuffer) throw Error("Near transaction not provided.");
                // solana and near families can use same signature method
                signedTx.nearFamilyTx = await this.signSolMessage(txParams.transactionBuffer);
                return signedTx;
            }
            default:{
                throw Error(`Network of type: ${this.chainId} signatures not yet supported.`)
            }
        }
    }

    // signs btc family transaction
    async signBtcTransaction(btcTransaction:bitcoin.Psbt){
        throw Error("Bitcoin tx. signature not implemented yet.");
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
        let secretKey = this.createKeyPair().secretKey;
        // create sol signature
        let solSignature:Uint8Array = nacl.sign.detached(solTransactionBuffer, secretKey);
        return solSignature;
    }

    createKeyPair():nacl.SignKeyPair{
        let ed25519PrivKey = this._ed25519PrivateKey();
        // use sol secret key if present... otherwise use secpk251 private key.
        let keyPair:nacl.SignKeyPair = nacl.sign.keyPair.fromSecretKey(ed25519PrivKey?ed25519PrivKey:arrayify(this.privateKey));
        return keyPair;
    }

    // if coin type is of ethereum family... just use default ethers implementation
    // else... create and set address
    generateAddress():string{
        switch(this.networkFamily){
            case(NetworkFamily.EVM):{
                // use default address created by ethers wallet
                return this.address;
            }
            case(NetworkFamily.Bitcoin):{
                return this.generateBitcoinFamilyAddress();
            }
            case(NetworkFamily.Solana):{
                return this.generateED25519Address();
            }
            case(NetworkFamily.Near):{
                // generate ed25519Address as hex
                return this.generateED25519Address(true);
            }
            default:{
                throw(Error(`Unable to generate address for wallet with network type: ${this.chainId}`));
            }
        }
    
    }

    // returns address for coins in the solana family
    generateED25519Address(isHexRep?:boolean):string{
        // intialize sol address to return
        let ed25519Address:string;
        let ed25519PrivKey = this._ed25519PrivateKey();
        // create new sol address from 
        let keypair = this.createKeyPair();
        let ed25519Keypair:Keypair = Keypair.fromSecretKey(keypair.secretKey);
        // create sol keypair based on privkey availability 
        if(ed25519PrivKey){
            ed25519Keypair = Keypair.fromSecretKey(ed25519PrivKey);
        }
        // if undefined, use sol keypair defined by secpk251 private key
        else{
            let secretKey = nacl.sign.keyPair.fromSeed(arrayify(this.privateKey)).secretKey;
            ed25519Keypair = Keypair.fromSecretKey(secretKey);
        }
        // return address in correct format
        if(isHexRep){
            ed25519Address = ed25519Keypair.publicKey.toBuffer().toString('hex');
        }
        else{
            ed25519Address = ed25519Keypair.publicKey.toString();
        }
        return ed25519Address;
    }

    // generates address for networks within the bitcoin family
    generateBitcoinFamilyAddress():string{
        let pubKey:string = this.publicKey;
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


}