import { keccak256 } from "@ethersproject/keccak256"
import * as bip from "bip39"
import { Network, NetworkFamily } from "./network"
import { getAddress } from "@ethersproject/address";
import * as ed25519 from "ed25519-hd-key"


export function normalizeMnemonic(mnemonic: string): string {
    return mnemonic.trim().toLowerCase().replace(/\r/, " ").replace(/ +/, " ")
}

export function validateAndFormatMnemonic(
    mnemonic: string,
    wordlist?: string[]
): string | null {
    const normalized = normalizeMnemonic(mnemonic)

    if (bip.validateMnemonic(normalized, wordlist)) {
        return normalized
    }
    return null
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

//extracts chain id from BIP-044 compatible path
export function getChainIdFromPath(path:string):string{
    const pathParts = path.split('/');
    // get chain id
    var chainId:string = pathParts[2];
    // remove apostraphe added for hardened path
    chainId = chainId.replace("'", "");
    return chainId;
}

export function toChecksumAddress(address: string, chainId?: number): string {
    const whitelistedChainIds = [30, 31]
    const addressWithOutPrefix = normalizeHexAddress(address)
      .replace("0x", "")
      .toLowerCase()
    const prefix =
      chainId && whitelistedChainIds.includes(chainId) ? `${chainId}0x` : ""
    const hash = keccak256(
      Buffer.from(`${prefix}${addressWithOutPrefix}`, "ascii")
    ).replace("0x", "")
  
    const checkSum = Array.from(addressWithOutPrefix)
      .map((_, index): string => {
        if (parseInt(hash[index], 16) >= 8) {
          return addressWithOutPrefix[index].toUpperCase()
        }
        return addressWithOutPrefix[index]
      })
      .join("")
  
    return `0x${checkSum}`
  }


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
export function isValidAddress(address:string, network:Network):boolean{
    switch(network.networkFamily){
        case NetworkFamily.EVM: { 
            try{
                getAddress(address);
                return true;
            } 
            catch(e){
                return false;
            }
         } 
         default: { 
             // for now... just return true
            return true;
            break; 
         } 
    }
}

// formats blockchain address
export function formatAddress(address:string, network:Network):string{
    if(!isValidAddress(address, network)) throw(Error("Invalid address was passed in!"));
    switch(network.networkFamily){
        case NetworkFamily.EVM: { 
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
    const seedBuffer = bip.mnemonicToSeedSync(mnemonic); 
    let key = ed25519.derivePath(path, Buffer.from(seedBuffer).toString('hex')).key;
    return key;
}


