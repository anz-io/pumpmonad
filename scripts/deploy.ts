import "dotenv/config"
import { deployContract, deployUpgradeableContract } from "./utils"
import { PumpMonadStaking, PumpToken } from "../typechain-types"
import { parseEther } from "ethers"

async function main() {
  const pumpmonad = await deployContract("PumpToken", [], true) as PumpToken
  const pumpmonadstaking = await deployUpgradeableContract(
    "PumpMonadStaking", [await pumpmonad.getAddress()], true
  ) as PumpMonadStaking

  await pumpmonad.setMinter(await pumpmonadstaking.getAddress(), true)
  
  await pumpmonadstaking.setAllowNormalUnstake(true)
  await pumpmonadstaking.setAllowInstantUnstake(true)
  await pumpmonadstaking.setAllowClaim(true)
  await pumpmonadstaking.setStakeAssetCap(parseEther("10000"))
  await pumpmonadstaking.stake({ value: parseEther("0.001") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

