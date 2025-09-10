import "dotenv/config"
import { deployContract, deployUpgradeableContract } from "./utils"
import { PumpHypeStaking, PumpToken } from "../typechain-types"
import { parseEther } from "ethers"

async function main() {
  const pumphype = await deployContract("PumpToken", [], true) as PumpToken
  const pumphypestaking = await deployUpgradeableContract(
    "PumpHypeStaking", [await pumphype.getAddress()], true
  ) as PumpHypeStaking

  await pumphype.setMinter(await pumphypestaking.getAddress(), true)
  
  await pumphypestaking.setAllowNormalUnstake(true)
  await pumphypestaking.setAllowInstantUnstake(true)
  await pumphypestaking.setAllowClaim(true)
  await pumphypestaking.setStakeAssetCap(parseEther("10000"))
  await pumphypestaking.stake({ value: parseEther("0.001") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

