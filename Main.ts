//imports
import { BigNumber, ethers, providers, Contract, utils, Wallet } from "ethers";
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleResolution, FlashbotsBundleTransaction } from "@flashbots/ethers-provider-bundle"
import { TransferERC20 } from "./TransferERC20";
import { Base } from "./Base";

//wallet
const signerKey = "";
const sponsorKey = "";
const relayKey = "";
const relayWallet = new Wallet(relayKey);
const signerWallet = new Wallet(signerKey);
const sponsorWallet = new Wallet(sponsorKey);

//provider
const APIKey = "1rniO9YjgRk9mMUx1y78bYWt5qz5XWn4";
const provider = new ethers.providers.AlchemyProvider("goerli", APIKey);

//function
const main = async () => {

  const flashBotsProvider = await FlashbotsBundleProvider.create(provider, relayWallet,"https://relay-goerli.epheph.com/");
  let recepient = "";
  let tokenAddress = "";
  const engine: Base = new TransferERC20(provider, signerWallet.address, recepient, tokenAddress);
  const sponsoredTransactions = await engine.getSponsoredTransactions();

    const gasEstimates = await Promise.all(sponsoredTransactions.map(tx =>
      provider.estimateGas({
        ...tx,
        from: tx.from === undefined ? signerWallet.address : tx.from
      }))
    )

    const BLOCKS_IN_FUTURE = 2;
    const GWEI = BigNumber.from(10).pow(9);
    const PRIORITY_GAS_PRICE = GWEI.mul(100)
    const block = await provider.getBlock("latest");
    const gasEstimateTotal = gasEstimates.reduce((acc, cur) => acc.add(cur), BigNumber.from(0))
    const gasPrice = PRIORITY_GAS_PRICE.add(block.baseFeePerGas || 0);


    const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
      {
        transaction: {
          to: signerWallet.address,
          gasPrice: gasPrice,
          value: gasEstimateTotal.mul(gasPrice),
          gasLimit: 21000,
        },
        signer: sponsorWallet
      },
      ...sponsoredTransactions.map((transaction, txNumber) => {
        return {
          transaction: {
            ...transaction,
            gasPrice: gasPrice,
            gasLimit: gasEstimates[txNumber],
          },
          signer: signerWallet,
        }
      })
    ]

    provider.on('block', async (blockNumber) => {
      const targetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
      console.log(`Current Block Number: ${blockNumber},   Target Block Number:${targetBlockNumber}`)
      const bundleResponse = await flashBotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
      if ('error' in bundleResponse) {
        throw new Error(bundleResponse.error.message)
      }
      const bundleResolution = await bundleResponse.wait()
      if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
        console.log(`Congrats, included in ${targetBlockNumber}`)
        process.exit(0)
      } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
        console.log(`Not included in ${targetBlockNumber}`)
      } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
        console.log("Nonce too high, bailing")
        process.exit(1)
      }
    })


}

main();
