import { Provider, TransactionRequest } from "@ethersproject/abstract-provider";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";
import { Wallet } from "@ethersproject/wallet";
import { BytesLike } from "@ethersproject/bytes";
import { SigningKey } from "@ethersproject/signing-key";
import { NetworkFamily } from "./models"
import { NetworkInfo, NetworkInfoDict } from "./network"
import * as bitcoin from 'bitcoinjs-lib'

class WalletKryptik extends Wallet{
    // set default cointype... can also be set via the constructor
    public readonly coinType:number = 60
    // wallet network family... set default as evm
    public networkFamily:NetworkFamily = NetworkFamily.EVM;
    

    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, coinType?:number, provider?: Provider, networkFamily?:NetworkFamily) {
        super(privateKey, provider);
        // if cointype is provided... set as wallet coin type
        if(coinType!=null){
            this.coinType = coinType
        }
        if(networkFamily!=null){
            this.networkFamily = networkFamily
        }
        else{
            this.getNetworkFamily(this.coinType)
        }
        if(networkFamily) this.networkFamily = networkFamily;
        // sets address for wallet
        this.generateAddress(this.publicKey)
    }

    // sign tx.
    signKryptikTransaction(evmTransaction?: TransactionRequest, btcTransaction?:bitcoin.Psbt, solTransaction?:string): Promise<string> {
        if(this.networkFamily == NetworkFamily.EVM && evmTransaction){
            // use default signer implemented by ethers wallet
            return this.signTransaction(evmTransaction)
        }
        if(this.networkFamily == NetworkFamily.Bitcoin && btcTransaction){
            // btcTransaction.signInput(0, pk)
            
        }
        if(this.networkFamily == NetworkFamily.Solana && solTransaction){
            //implement
        }
        throw Error(`Network of type: ${this.coinType} signatures not yet supported.`)
    }



    // if coin type is of ethereum family... just use default ethers implementation
    // else... create and set address
    generateAddress(publicKey:string):string{
        if(this.networkFamily == NetworkFamily.EVM){
            // use default address created by ethers wallet
            return this.address;
        }
        if(this.networkFamily == NetworkFamily.Bitcoin){
            return this.generateBitcoinFamilyAddress(publicKey)
        }
        if(this.networkFamily == NetworkFamily.Solana){
            return this.generateSolanaFamilyAddress(publicKey);
        }
        throw(Error(`Unable to generate address for wallet with network type: ${this.coinType}`));
    }

    // returns address for coins in the solana family
    generateSolanaFamilyAddress = function(pubKey:string):string{
        return pubKey;
    }

    generateBitcoinFamilyAddress(pubKey:string):string{
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
        let addressToreturn:string = "";
        switch(this.coinType){
            case 0:{
                const { address } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(pubKey, 'hex') });
                if(address) return addressToreturn;
                break;
            }
            case 2:{
                const { address } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(pubKey, 'hex') , network:LITECOIN});
                if(address) return addressToreturn;
                break;
            }
            default:{
                throw(Error(`Error: coin type ${this.coinType} is not specified within the bitcoin network family.`));   
            }
        }
        return addressToreturn;
    }

    // returns chain family
    getNetworkFamily = function(chainCode:number):NetworkFamily{
        for (let ticker in NetworkInfoDict) {
            let NetworkInfo:NetworkInfo = NetworkInfoDict[ticker];
            // match chainCode
            if(NetworkInfo.chainCode == chainCode){
                return NetworkInfo.networkFamily
            }
        }
        // if we got this far, something went wrong
        return NetworkFamily.EVM;
    }


}