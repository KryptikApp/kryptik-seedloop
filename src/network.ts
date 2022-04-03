import { NetworkFamily } from "./models"


export class NetworkInfo{
    public chainCode:number
    public networkFamily: NetworkFamily
    constructor(chainCode:number, networkFamily:NetworkFamily){
        this.chainCode = chainCode;
        this.networkFamily = networkFamily
    }
}

// SLIP-0044 specified coin types
export let NetworkInfoDict:{[name: string]: NetworkInfo}  = {
    btc: new NetworkInfo(0, NetworkFamily.Bitcoin), 
    ltc: new NetworkInfo(2, NetworkFamily.Bitcoin), 
    doge: new NetworkInfo(3, NetworkFamily.Bitcoin), 
    eth: new NetworkInfo(60, NetworkFamily.EVM), 
    xmr: new NetworkInfo(128, NetworkFamily.Bitcoin),
    zec: new NetworkInfo(133, NetworkFamily.Bitcoin), 
    bch: new NetworkInfo(145, NetworkFamily.Bitcoin), 
    sol: new NetworkInfo(145, NetworkFamily.Solana), 
    near: new NetworkInfo(397, NetworkFamily.EVM), 
    pokt: new NetworkInfo(635, NetworkFamily.EVM), 
    bnb: new NetworkInfo(714, NetworkFamily.EVM), 
    avaxc: new NetworkInfo(9005, NetworkFamily.Solana), 
    one: new NetworkInfo(1023, NetworkFamily.Bitcoin)
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
    readonly path: string
    // BIP-44 coin code
    readonly chainId: number
    readonly networkFamily:number

    constructor(fullName: string, ticker: string) {
        this.fullName = fullName
        this.ticker = ticker.toLowerCase();
        // ensure coin ticker is in coinTypes before we search
        if (!(this.ticker in NetworkInfoDict)) {
            throw new Error(`${this.ticker}: Coin path not found!`)
        }
        this.path = this.getPath();
        this.chainId = this.getChainId();
        this.networkFamily = this.getNetworkfamily();
    }

    // builds coin path based on BIP-44 standard
    getPath(): string{
        let networkInfo:NetworkInfo = NetworkInfoDict[this.ticker];
        let path = `m/44'/${networkInfo.chainCode}'/0'/0`;
        return path;
    }

    // returns network family for given chain
    getNetworkfamily(): number{
        let networkInfo:NetworkInfo = NetworkInfoDict[this.ticker];
        let networkFamily:NetworkFamily = networkInfo.networkFamily;
        return networkFamily;
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
defaultNetworks.bnb = new Network("Binance", "bnb")


// return chain that matches ticker
export function NetworkFromTicker(ticker: string): Network{
    try{
        return defaultNetworks[ticker.toLowerCase()]
    }
    catch(err){
        throw(Error(`Unable to find network for ticker: ${ticker}`))
    }
}