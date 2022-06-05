export enum NetworkFamily{
    EVM = 0,
    // uses special address
    Solana = 1,
    // general tx. based networks like BTC, LTC, etc.
    Bitcoin = 2
}

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
    matic: new NetworkInfo(60, NetworkFamily.EVM), 
    xmr: new NetworkInfo(128, NetworkFamily.Bitcoin),
    zec: new NetworkInfo(133, NetworkFamily.Bitcoin), 
    bch: new NetworkInfo(145, NetworkFamily.Bitcoin), 
    sol: new NetworkInfo(501, NetworkFamily.Solana), 
    near: new NetworkInfo(397, NetworkFamily.EVM), 
    pokt: new NetworkInfo(635, NetworkFamily.EVM), 
    bnb: new NetworkInfo(714, NetworkFamily.EVM), 
    avaxc: new NetworkInfo(9005, NetworkFamily.EVM), 
    one: new NetworkInfo(1023, NetworkFamily.Bitcoin)
};



export interface INetwork{
    ticker: string,
    chainId: number
}

export interface NetworkParameters{
    fullName: string,
    ticker: string,
    path?:string,
    chainId?:number,
    networkFamily?:number
}

export class Network{
    readonly fullName: string
    readonly ticker: string
    // base path used for hdnode derivation
    readonly path: string
    // BIP-44 coin code
    readonly chainId: number
    readonly networkFamily:number

    constructor(networkParams:NetworkParameters) {
        this.fullName = networkParams.fullName;
        this.ticker = networkParams.ticker.toLowerCase();
        this.path =  networkParams.path?networkParams.path : this.getPath();
        this.chainId = networkParams.chainId? networkParams.chainId : this.getChainId();
        this.networkFamily = networkParams.networkFamily? networkParams.networkFamily : this.getNetworkfamily();
    }

    // builds coin path based on BIP-44 standard
    private getPath(chainCodeIn?:number): string{
        let chainCode:number;
        if(chainCodeIn){
            chainCode = chainCodeIn
        }
        else{
            let networkInfo:NetworkInfo = NetworkInfoDict[this.ticker];
            chainCode = networkInfo.chainCode;
        }
        
        let path = `m/44'/${chainCode}'/0'/0`;
        return path;
    }

    // returns network family for given chain
    private getNetworkfamily(): number{
        let networkInfo:NetworkInfo = NetworkInfoDict[this.ticker];
        let networkFamily:NetworkFamily = networkInfo.networkFamily;
        return networkFamily;
    }
    
    // returns BIP-44 specified coin type (code)
    private getChainId(): number{
        let coinType:number = NetworkInfoDict[this.ticker].chainCode;
        return coinType;
    }

}

// default networks used to init. seed loop
export let defaultNetworks: { [name: string]: Network } = {}
defaultNetworks.btc = new Network({fullName: "Bitcoin", ticker: "btc"})
defaultNetworks.eth = new Network({fullName: "Ethereum", ticker: "eth"})
defaultNetworks.sol =  new Network({fullName: "Solana", ticker: "sol"})
defaultNetworks.avaxc = new Network({fullName:"Avalanche C Chain",  ticker: "avaxc"})
defaultNetworks.doge = new Network({fullName: "Dogecoin", ticker: "doge"})
// defaultNetworks.near = new Network("Near", "near")
defaultNetworks.bnb = new Network({fullName:"Binance", ticker: "bnb"})
defaultNetworks.matic = new Network({fullName:"Polygon", ticker: "matic"})
defaultNetworks.ltc = new Network({fullName:"Litecoin", ticker: "ltc"});


// return chain that matches ticker
export function NetworkFromTicker(ticker: string): Network{
    try{
        return defaultNetworks[ticker.toLowerCase()]
    }
    catch(err){
        throw(Error(`Unable to find network for ticker: ${ticker}`))
    }
}

export function NetworkFamilyFromFamilyName(familyName:string):NetworkFamily{
    switch(familyName.toLowerCase()){
        case "bitcoin":{
            return NetworkFamily.EVM
            break;
        }
        case "evm":{
            return NetworkFamily.EVM
            break;
        }
        case "solana":{
            return NetworkFamily.Solana;
            break;
        }
        default:{
            // return evm network family as default 
            return NetworkFamily.EVM;
            break;
        }
    }
}
