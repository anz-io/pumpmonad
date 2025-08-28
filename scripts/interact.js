// npx hardhat console --network monadtest

require("dotenv").config();

const pm = await ethers.getContractAt("PumpMonadStaking", process.env.MONADTEST_MONAD_STAKING);
const [admin] = await ethers.getSigners();
