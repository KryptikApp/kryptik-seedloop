import { NetworkFamily } from "./models"


export class NewtorkInfo{
    public chainCode:number
    public networkFamily: NetworkFamily
    constructor(chainCode:number, networkFamily:NetworkFamily){
        this.chainCode = chainCode;
        this.networkFamily = networkFamily
    }
}

// SLIP-0044 specified coin types
export let NetworkInfoDict:{[name: string]: NewtorkInfo}  = {
    btc: new NewtorkInfo(0, NetworkFamily.Bitcoin), 
    ltc: new NewtorkInfo(2, NetworkFamily.Bitcoin), 
    doge: new NewtorkInfo(3, NetworkFamily.Bitcoin), 
    eth: new NewtorkInfo(60, NetworkFamily.EVM), 
    xmr: new NewtorkInfo(128, NetworkFamily.Bitcoin),
    zec: new NewtorkInfo(133, NetworkFamily.Bitcoin), 
    bch: new NewtorkInfo(145, NetworkFamily.Bitcoin), 
    sol: new NewtorkInfo(145, NetworkFamily.Solana), 
    pokt: new NewtorkInfo(635, NetworkFamily.EVM), 
    bnb: new NewtorkInfo(714, NetworkFamily.EVM), 
    avaxc: new NewtorkInfo(9005, NetworkFamily.Solana), 
    one: new NewtorkInfo(1023, NetworkFamily.Bitcoin)
};


export interface HDCoin {
    getPath(): string
}

export interface INetwork{
    ticker: string,
    chainId: number
}

export class Network implements HDCoin {
    readonly fullName: string
    readonly ticker: string
    // base path used for hdnode derivation
    readonly path?: string
    // BIP-44 coin code
    readonly chainId: number

    constructor(name: string, ticker: string) {
        this.fullName = name
        this.ticker = ticker.toLowerCase();
        // ensure coin ticker is in coinTypes before we search
        if (!(this.ticker in NetworkInfoDict)) {
            throw new Error(`${this.ticker}: Coin path not found!`)
        }
        this.path = this.getPath();
        this.chainId = this.getChainId();
    }

    // builds coin path based on BIP-44 standard
    getPath(): string{
        let coinType = NetworkInfoDict[this.ticker];
        let path = `m/44'/${coinType}'/0'/0`;
        return path;
    }
    
    // returns BIP-44 specified coin type (code)
    getChainId(): number{
        let coinType:number = NetworkInfoDict[this.ticker].chainCode;
        return coinType;
    }

}

// default networks used to init. seed loop
export let defaultNetworks: { [name: string]: Network } = {}
defaultNetworks.btc = new Network("Bitcoin", "btc")
defaultNetworks.eth = new Network("Ethereum", "eth")
defaultNetworks.sol =  new Network("Solana", "sol")
defaultNetworks.avaxc = new Network("Avalanche C Chain",  "avaxc")
defaultNetworks.doge = new Network("Dogecoin", "doge")
defaultNetworks.near = new Network("Near", "near")



// return chain that matches ticker
export function NetworkFromTicker(ticker: string): Network{
    return defaultNetworks[ticker]
}