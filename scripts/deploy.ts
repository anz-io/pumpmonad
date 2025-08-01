import "dotenv/config"
import { deployContract, deployUpgradeableContract } from "./utils"
import { ERC20, PumpMonadStaking, PumpToken } from "../typechain-types"

async function main() {
  const wmonad = await deployContract("MockMonad", [], true) as ERC20
  const pumpmonad = await deployContract("PumpToken", [], true) as PumpToken
  const pumpmonadstaking = await deployUpgradeableContract(
    "PumpMonadStaking", [await wmonad.getAddress(), await pumpmonad.getAddress()], true
  ) as PumpMonadStaking
  
  await pumpmonadstaking.setAllowNormalUnstake(true)
  await pumpmonadstaking.setAllowInstantUnstake(true)
  await pumpmonadstaking.setAllowClaim(true)
  
  await pumpmonad.setMinter(await pumpmonadstaking.getAddress(), true)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

