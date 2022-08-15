import { mnemonicToSeedSync, validateMnemonic } from "bip39"
import base58 from "bs58"
import * as ed25519 from "ed25519-hd-key"
import { getAddress } from "@ethersproject/address";
import { Network, NetworkFamily } from "./network"


export function normalizeMnemonic(mnemonic: string): string {
    return mnemonic.trim().toLowerCase().replace(/\r/, " ").replace(/ +/, " ")
}

export function validateAndFormatMnemonic(
    mnemonic: string,
    wordlist?: string[]
): string | null {
    const normalized = normalizeMnemonic(mnemonic)

    if (validateMnemonic(normalized, wordlist)) {
        return normalized
    }
    return null;
}

export function normalizeHexAddress(address: string | Buffer): string {
    const addressString =
        typeof address === "object" && !("toLowerCase" in address)
            ? address.toString("hex")
            : address
    const noPrefix = addressString.replace(/^0x/, "")
    const even = noPrefix.length % 2 === 0 ? noPrefix : `0${noPrefix}`
    return `0x${Buffer.from(even, "hex").toString("hex")}`
}


export function createEd25519SecretKey(fullPath:string, seed:Buffer){
    const key = ed25519.derivePath(fullPath, seed.toString('hex')).key;
    return key;
}


// ----- address and seed utils -----

// Captures 0x + 4 characters, then the last 4 characters.
const truncateRegexEth = /^(0x[a-zA-Z0-9]{4})[a-zA-Z0-9]+([a-zA-Z0-9]{4})$/;
// Captures 4 characters, then the last 4 characters.
const truncateRegexSol = /^([a-zA-Z0-9]{4})[a-zA-Z0-9]+([a-zA-Z0-9]{4})$/;
/**
 * Truncates an ethereum address to the format 0x0000…0000
 * @param address Full address to truncate
 * @returns Truncated address
 */
const truncateEthAddress = (address: string) => {
  const match = address.match(truncateRegexEth);
  if (!match) return address;
  return `${match[1]}…${match[2]}`;
};

const truncateSolAddress = (address: string) => {
    const match = address.match(truncateRegexSol);
    if (!match) return address;
    return `${match[1]}…${match[2]}`;
}


// truncates blockchain address
export function truncateAddress(address: string, network:Network):string{
    switch(network.networkFamily){
        case NetworkFamily.EVM: { 
            return truncateEthAddress(address);
            break; 
         } 
         case NetworkFamily.Solana:{
             return truncateSolAddress(address);
             break;
         }
         default: { 
             // for now... just use solana truncation
             return truncateSolAddress(address);
            break; 
         } 
    }
}

// validates blockchain address
export function isValidEVMAddress(address:string):boolean{
    try{
        getAddress(address);
        return true;
    } 
    catch(e){
        return false;
    }
}

// formats blockchain address
export function formatAddress(address:string, network:Network):string{
    switch(network.networkFamily){
        case NetworkFamily.EVM: { 
            if(!isValidEVMAddress(address)) throw(Error("Invalid address was passed in!"));
            return getAddress(address);
            break; 
         } 
         default: { 
             // for now... just return original address
            return address;
            break; 
         } 
    }
}

export function createWalletSeed(path:string, mnemonic:string):Buffer{
    const seedBuffer = mnemonicToSeedSync(mnemonic); 
    let key = ed25519.derivePath(path, Buffer.from(seedBuffer).toString('hex')).key;
    return key;
}


export function hexToBase58(hexString:string){
    let buff = Buffer.from(hexString, "hex");
    return base58.encode(buff);
}



