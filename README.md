# Leave Management System Canister

This is a decentralized Leave Management System built using the Azle framework and Internet Computer (IC). The system manages employee profiles, leave requests, and leave types, providing features for creating, approving, and managing leave requests with proper validations.

## Installation

1. Clone the repository.
   ```bash
   git clone https://github.com/Lydiayoks/employee-leave-management.git
   ```
2. Change the directory.
```bash
cd employee-leave-management
```
3. Install dependencies.
   ```bash
   npm install
   ```

4. Start the Local Replica.
```bash
dfx start --clean --background
```
5. Build and deploy the canister.
   ```bash
   dfx deploy
   ```

## Usage

This canister provides a set of methods to manage employees, leave requests, and leave types. You can interact with the canister by calling these methods from the frontend or backend code.

## Available Functions

### Employee Management

- **createEmployee(EmployeePayload):** Creates a new employee with leave balances.
- **getEmployees():** Retrieves all employees in the system.

### Leave Request Management

- **createLeaveRequest(LeaveRequestPayload):** Submits a new leave request for an employee.
- **getEmployeeLeaveRequests(employeeId):** Retrieves all leave requests for a specific employee.
- **approveLeaveRequest(requestId):** Approves a leave request and deducts leave days from the employee's balance.

### Leave Type Management

- **createLeaveType(LeaveTypePayload):** Adds a new leave type (e.g., Annual, Sick) with a quota.
- **getLeaveTypes():** Retrieves all available leave types.

### Leave Balances and Reports

- **accrueLeave(leaveRequestId):** Accrues leave for an employee after leave approval.
- **generateLeaveReport(employeeId):** Generates a leave report for a specific employee.

## Things to be explained in the course:

1. What is Ledger? More details here: https://internetcomputer.org/docs/current/developer-docs/integrations/ledger/
2. What is Internet Identity? More details here: https://internetcomputer.org/internet-identity
3. What is Principal, Identity, Address? https://internetcomputer.org/internet-identity | https://yumimarketplace.medium.com/whats-the-difference-between-principal-id-and-account-id-3c908afdc1f9
4. Canister-to-canister communication and how multi-canister development is done? https://medium.com/icp-league/explore-backend-multi-canister-development-on-ic-680064b06320

## How to deploy canisters implemented in the course

### Ledger canister

`./deploy-local-ledger.sh` - deploys a local Ledger canister. IC works differently when run locally so there is no default network token available and you have to deploy it yourself. Remember that it's not a token like ERC-20 in Ethereum, it's a native token for ICP, just deployed separately.
This canister is described in the `dfx.json`:

```
	"ledger_canister": {
  	"type": "custom",
  	"candid": "https://raw.githubusercontent.com/dfinity/ic/928caf66c35627efe407006230beee60ad38f090/rs/rosetta-api/icp_ledger/ledger.did",
  	"wasm": "https://download.dfinity.systems/ic/928caf66c35627efe407006230beee60ad38f090/canisters/ledger-canister.wasm.gz",
  	"remote": {
    	"id": {
      	"ic": "ryjl3-tyaaa-aaaaa-aaaba-cai"
    	}
  	}
	}
```

`remote.id.ic` - that is the principal of the Ledger canister and it will be available by this principal when you work with the ledger.

Also, in the scope of this script, a minter identity is created which can be used for minting tokens
for the testing purposes.
Additionally, the default identity is pre-populated with 1000_000_000_000 e8s which is equal to 10_000 \* 10**8 ICP.
The decimals value for ICP is 10**8.

List identities:
`dfx identity list`

Switch to the minter identity:
`dfx identity use minter`

Transfer ICP:
`dfx ledger transfer <ADDRESS> --memo 0 --icp 100 --fee 0`
where:

- `--memo` is some correlation id that can be set to identify some particular transactions (we use that in the marketplace canister).
- `--icp` is the transfer amount
- `--fee` is the transaction fee. In this case it's 0 because we make this transfer as the minter idenity thus this transaction is of type MINT, not TRANSFER.
- `<ADDRESS>` is the address of the recipient. To get the address from the principal, you can use the helper function from the marketplace canister - `getAddressFromPrincipal(principal: Principal)`, it can be called via the Candid UI.

### Internet identity canister

`dfx deploy internet_identity` - that is the canister that handles the authentication flow. Once it's deployed, the `js-agent` library will be talking to it to register identities. There is UI that acts as a wallet where you can select existing identities
or create a new one.
