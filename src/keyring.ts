import { getFullPath, Network, NetworkFamily, NetworkFromTicker } from "./network"
import HDKey from "hdkey"
// ethers helpers
import { resolveProperties } from "@ethersproject/properties";
import { SigningKey } from "@ethersproject/signing-key";
import { serialize, UnsignedTransaction } from "@ethersproject/transactions";
import {TransactionRequest} from "@ethersproject/abstract-provider"
import {hashMessage} from "@ethersproject/hash"


import { createEd25519SecretKey, normalizeHexAddress } from "./utils"
import { keccak256, publicToAddress } from "ethereumjs-util"
import { Account, CurveType } from "./account"
import * as nacl from "tweetnacl"
import bs58 from "bs58"
import { SignedTransaction } from "."
import { joinSignature } from "@ethersproject/bytes";



export type KeyringOptions = {
    basePath: string
    network: Network
    xpub: string
}

export const defaultKeyringOptions:KeyringOptions = {
  // default basePath is BIP-44
  basePath: "m/44'/60'/0'/0",
  network: NetworkFromTicker("eth"),
  xpub:""
}


export type SerializedHDKeyring = {
  basePath: string
  keyringType: string
  addressIndex: number
  network: Network,
  xpub:string
}

export interface TransactionParameters{
    evmTransaction?:TransactionRequest,
    transactionBuffer?:Uint8Array
}

export interface Keyring<T> {
  serialize(): T
  getAddresses():string[]
  addAddresses(seed:Buffer, numNewAccounts?: number):string[]
  signMessage(seed:Buffer, fullpath:string, address:string, message:string): string
  signTransaction(address:string, seed:Buffer, txParams:TransactionParameters): Promise<SignedTransaction>
}

export interface KeyringClass<T> {
  new (): Keyring<T>
  deserialize(serializedKeyring: T): Promise<Keyring<T>>
}


export class HDKeyring implements Keyring<SerializedHDKeyring> {
    static readonly type: string = "bip32"
  
    readonly basePath: string
  
    readonly network:Network

    private addressIndex: number
  
    private accounts:Account[] = []

    private hdKey:HDKey;

    private xpub:string;

  
    constructor(options: KeyringOptions) {
      const hdOptions: Required<KeyringOptions> = {
        ...options,
      }
  
      this.basePath = hdOptions.basePath
      this.addressIndex = 0
      this.accounts = []
      this.network = hdOptions.network;
      // create hdkey from extended PUBLIC key so...
      // no sensitive keys stored on keyring
      this.hdKey = HDKey.fromExtendedKey(hdOptions.xpub);
      this.xpub = hdOptions.xpub;
    }


    serialize(): SerializedHDKeyring {
        return {
            keyringType: HDKeyring.type,
            basePath: this.basePath,
            addressIndex: this.addressIndex,
            network: this.network,
            xpub:this.xpub
        }
    }

    static deserialize( seed:Buffer, obj: SerializedHDKeyring): HDKeyring {
        const {keyringType, basePath, addressIndex, network, xpub} = obj;
    
        if (keyringType !== HDKeyring.type) {
          throw new Error("HDKeyring only supports BIP-32/44 style HD wallets.")
        };
    
        const keyring = new HDKeyring({
          basePath: basePath,
          xpub:xpub,
          network: network
        });
    
        keyring.addAddresses(seed, addressIndex);
    
        return keyring;
      }

    getAddresses():string[]{
        return this.accounts.map((account) => account.address);
    }

    // we need seed for ED25519 Addys
    addAddresses(seed:Buffer, numNewAccounts = 1):string[] {
        const numAddresses = this.addressIndex;
        if (numNewAccounts < 0 || numAddresses + numNewAccounts > 2 ** 31 - 1) {
        throw new Error("New account index out of range")
        }
        for(let i = 0; i < numNewAccounts; i += 1) {
            let newAccount = this.generateAccount(numAddresses+i, seed);
            this.accounts.push(newAccount);
        }
        this.addressIndex += numNewAccounts
        const addresses = this.getAddresses();
        return addresses.slice(-numNewAccounts)
    }

    getPublicKeyString(seed:Buffer, address:string){
        let account:Account|undefined = this.accounts.find(a=>a.address.toLowerCase() == address.toLowerCase())
        if(!account) throw(new Error("Error: Unable to find an account that matches the given address"));
        let pubKeyString:string;
        switch(this.network.networkFamily){
            case(NetworkFamily.EVM):{
                pubKeyString = this.getEVMPubKeyString(account);
                break;
            }
            default:{
                pubKeyString = this.getEd25519PubKeyString(seed, account);
                break;
            }
        }
        return pubKeyString;
    }

    // for now... just return address
    private getEVMPubKeyString(account:Account):string{
        return account.address;
    }

    // for sol, will return same sol address
    // useful for getting NEAR pub key string
    // which is different than NEAR addres
    private getEd25519PubKeyString(seed:Buffer, account:Account):string{
        const hdED25519Seed:Buffer = createEd25519SecretKey(account.fullpath, seed);
        const keypair:nacl.SignKeyPair = nacl.sign.keyPair.fromSeed(hdED25519Seed);
        const newAddress:string = bs58.encode(keypair.publicKey)
        return newAddress;
    }

    signMessage(seed:Buffer, address:string, message:string):string{
        let account:Account|undefined = this.accounts.find(a=>a.address.toLowerCase() == address.toLowerCase())
        if(!account) throw(new Error("Error: Unable to find an account that matches the given address"));
        let signedMsg:string;
        switch(this.network.networkFamily){
            // TODO: UPDATE TO PROVIDE SUPPORT FOR NON-EVM MESSAGES
            case NetworkFamily.EVM:{
                signedMsg = this.signEVMMessage(seed, account, message);
                break;
            }
            default:{
                throw Error(`Error: ${this.network.fullName} message signatures not yet implemented.`)
            }
        }
        return signedMsg;
    }

    private signEVMMessage(seed:Buffer, account:Account, message:string){
        let newHDKey = HDKey.fromMasterSeed(seed);
        newHDKey = newHDKey.derive(account.fullpath);
        let signingKey:SigningKey = new SigningKey(newHDKey.privateKey);
        return joinSignature(signingKey.signDigest(hashMessage(message)));
    }

    // currently unused
    private async signEd25519Message(seed:Buffer, account:Account, message:string):Promise<string>{
        var msg = Buffer.from(message);
        let signedMsg = await this.signSolMessage(seed, account, msg);
        return signedMsg.toString();
    }

    generateAccount(index:number, seed:Buffer):Account{
         // derive child pub key
         switch(this.network.networkFamily){
             case(NetworkFamily.EVM):{
                 // use default address created by ethers wallet
                 return this.generateEVMAccount(index);
             }
             case(NetworkFamily.Solana):{
                 return this.generateED25519Address(seed, index);
             }
             case(NetworkFamily.Near):{
                 // generate ed25519Address as hex
                 return this.generateED25519Address(seed, index, true);
             }
             default:{
                 throw(Error(`Unable to generate address for wallet with network type: ${this.network.chainId}`));
             }
         }
    }

    private generateEVMAccount(accountNumber:number):Account{
        // remember... we already derived hd key parents with basepath
        let accountPubkey = this.hdKey.derive("m/" + accountNumber).publicKey;
        let addressBuffer = publicToAddress(accountPubkey, true);
        // Only take the lower 160bits of the hash
        let newAddress:string = "0x" + addressBuffer.toString("hex");
        newAddress = normalizeHexAddress(newAddress);
        let accountPath = getFullPath(this.basePath, this.network.networkFamily, accountNumber);
        let newAccount:Account = {address:newAddress, fullpath:accountPath, curve:CurveType.Secp25k1}
        return newAccount;
    }


    private generateED25519Address(seed:Buffer, accountNumber:number, isHexRep?:boolean):Account{
        let newHDKey = HDKey.fromMasterSeed(seed);
        let accountPath = getFullPath(this.basePath, this.network.networkFamily, accountNumber);
        newHDKey = newHDKey.derive(accountPath);
        // get hd derived ed25519 curve seed
        let hdED25519Seed:Buffer = createEd25519SecretKey(accountPath, seed);
        let keypair:nacl.SignKeyPair = nacl.sign.keyPair.fromSeed(hdED25519Seed);
        let newAddress:string;
        if(isHexRep){
            newAddress = Buffer.from(keypair.publicKey).toString("hex");
        }
        else{
            newAddress = bs58.encode(keypair.publicKey)
        }
        let newAccount:Account = {address:newAddress, fullpath:accountPath, curve:CurveType.Secp25k1}
        return newAccount;
    }

    // SIGNING METHODS
    async signTransaction(address:string, seed:Buffer, txParams:TransactionParameters): Promise<SignedTransaction> {
        let account:Account|undefined = this.accounts.find(a=>a.address.toLowerCase() == address.toLowerCase())
        if(!account) throw(new Error("Error: Unable to find an account that matches the given address"));
        let signedTx:SignedTransaction = {};
        switch(this.network.networkFamily){
            case NetworkFamily.EVM :{
                // ensure evm tx. was passed in
                if(!txParams.evmTransaction) throw Error("EVM transaction not provided.");
                // use default signer implemented by ethers wallet
                signedTx.evmFamilyTx = await this.signEVMTransaction(seed, account, txParams.evmTransaction);
                return signedTx;
            }
            case NetworkFamily.Solana:{
                // ensure sol tx. was passed in
                if(!txParams.transactionBuffer) throw Error("Sol transaction not provided.");
                signedTx.solanaFamilyTx = await this.signSolMessage(seed, account, txParams.transactionBuffer);
                return signedTx;
            }
            case NetworkFamily.Near:{
                // ensure near tx. was passed in
                if(!txParams.transactionBuffer) throw Error("NEAR transaction not provided.");
                // solana and near families can use same signature method
                signedTx.nearFamilyTx = await this.signSolMessage(seed, account, txParams.transactionBuffer);
                return signedTx;
            }
            default:{
                throw Error(`Error: ${this.network.fullName} signatures not yet supported.`)
            }
        }
    }

    private async signEVMTransaction(seed:Buffer, account:Account, transaction:TransactionRequest):Promise<string>{
        let newHDKey = HDKey.fromMasterSeed(seed);
        newHDKey = newHDKey.derive(account.fullpath);
        let signingKey:SigningKey = new SigningKey(newHDKey.privateKey);
        return resolveProperties(transaction).then((tx) => {
            if (tx.from != null) {
                if (tx.from !== account.address) {
                    throw Error("transaction from address mismatch");
                }
                delete tx.from;
            }
            const signature = signingKey.signDigest(keccak256(Buffer.from(serialize(<UnsignedTransaction>tx))));
            return serialize(<UnsignedTransaction>tx, signature);
        });
    }

     // can sign data OR transaction!
    private async signSolMessage(seed:Buffer, account:Account, solTransactionBuffer:Uint8Array):Promise<Uint8Array>{
        // get hd derived ed25519 curve seed
        let hdED25519Seed:Buffer = createEd25519SecretKey(account.fullpath, seed);
        let keypair:nacl.SignKeyPair = nacl.sign.keyPair.fromSeed(hdED25519Seed);
        // create sol signature
        let solSignature:Uint8Array = nacl.sign.detached(solTransactionBuffer, keypair.secretKey);
        return solSignature;
    }
}