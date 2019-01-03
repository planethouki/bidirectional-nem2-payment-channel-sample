const nem2Sdk = require("nem2-sdk");
const crypto = require("crypto");
const jssha3 = require('js-sha3');
const rx = require('rxjs');
const op = require('rxjs/operators');
const request = require('request');

const Address = nem2Sdk.Address,
    Deadline = nem2Sdk.Deadline,
    Account = nem2Sdk.Account,
    UInt64 = nem2Sdk.UInt64,
    NetworkType = nem2Sdk.NetworkType,
    PlainMessage = nem2Sdk.PlainMessage,
    TransferTransaction = nem2Sdk.TransferTransaction,
    Mosaic = nem2Sdk.Mosaic,
    MosaicId = nem2Sdk.MosaicId,
    TransactionHttp = nem2Sdk.TransactionHttp,
    AccountHttp = nem2Sdk.AccountHttp,
    MosaicHttp = nem2Sdk.MosaicHttp,
    NamespaceHttp = nem2Sdk.NamespaceHttp,
    MosaicService = nem2Sdk.MosaicService,
    XEM = nem2Sdk.XEM,
    AggregateTransaction = nem2Sdk.AggregateTransaction,
    PublicAccount = nem2Sdk.PublicAccount,
    LockFundsTransaction = nem2Sdk.LockFundsTransaction,
    Listener = nem2Sdk.Listener,
    CosignatureTransaction = nem2Sdk.CosignatureTransaction,
    SecretLockTransaction = nem2Sdk.SecretLockTransaction,
    SecretProofTransaction = nem2Sdk.SecretProofTransaction,
    HashType = nem2Sdk.HashType,
    ModifyMultisigAccountTransaction = nem2Sdk.ModifyMultisigAccountTransaction,
    MultisigCosignatoryModificationType = nem2Sdk.MultisigCosignatoryModificationType,
    MultisigCosignatoryModification = nem2Sdk.MultisigCosignatoryModification;

const filter = op.filter,
    map = op.map,
    flatMap = op.flatMap;
const sha3_512 = jssha3.sha3_512;
const sha3_256 = jssha3.sha3_256;

const ENDPOINT = "http://catapult48gh23s.xyz:3000";

function sendXEMFirst(address1, address2, accountG) {
    return new Promise((resolve, reject) => {
        const publicAccount1Tx = TransferTransaction.create(
            Deadline.create(),
            address1,
            [XEM.createRelative(5)],
            PlainMessage.create('send first 5XEM'),
            NetworkType.MIJIN_TEST,
        );
        const publicAccount2Tx = TransferTransaction.create(
            Deadline.create(),
            address2,
            [XEM.createRelative(5)],
            PlainMessage.create('send first 5XEM'),
            NetworkType.MIJIN_TEST,
        );
        const aggregateTransaction = AggregateTransaction.createComplete(
            Deadline.create(),
            [
                publicAccount1Tx.toAggregate(accountG.publicAccount),
                publicAccount2Tx.toAggregate(accountG.publicAccount),
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = accountG.sign(aggregateTransaction);
        console.log(signedTransaction.hash);
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            transactionHttp.announce(signedTransaction).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(accountG.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedTransaction.hash)
            ).subscribe(
                ignore => {
                    listener.close();
                    resolve();
                },
                error => reject(error)
            );
        }).catch((error) => {
            console.error(error);
        });
    });
}

function createMultisigAccount(accountM, publicAccount1, publicAccount2) {
    return new Promise((resolve, reject) => {
        const convertIntoMultisigTransaction = ModifyMultisigAccountTransaction.create(
            Deadline.create(),
            2,
            2,
            [
                new MultisigCosignatoryModification(
                    MultisigCosignatoryModificationType.Add,
                    publicAccount1,
                ),
                new MultisigCosignatoryModification(
                    MultisigCosignatoryModificationType.Add,
                    publicAccount2,
                )
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = accountM.sign(convertIntoMultisigTransaction);
        console.log(signedTransaction.hash);
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            transactionHttp.announce(signedTransaction).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(accountM.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedTransaction.hash)
            ).subscribe(
                ignore => {
                    listener.close();
                    resolve();
                },
                error => reject(error)
            );
        }).catch((error) => {
            console.error(error);
        });
    });
}

function createOpeningTransaction(multisigPublicAccount, account1, publicAccount2, accountG) {
    return new Promise((resolve, reject) => {
        const account1Tx = TransferTransaction.create(
            Deadline.create(),
            multisigPublicAccount.address,
            [XEM.createRelative(5)],
            PlainMessage.create('opening tx 5XEM'),
            NetworkType.MIJIN_TEST,
        );
        const publicAccount2Tx = TransferTransaction.create(
            Deadline.create(),
            multisigPublicAccount.address,
            [XEM.createRelative(5)],
            PlainMessage.create('opening tx 5XEM'),
            NetworkType.MIJIN_TEST,
        );
        const opningTransaction = AggregateTransaction.createBonded(
            Deadline.create(),
            [
                account1Tx.toAggregate(account1.publicAccount),
                publicAccount2Tx.toAggregate(publicAccount2),
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = account1.sign(opningTransaction);
        const lockFundsTransaction = LockFundsTransaction.create(
            Deadline.create(),
            XEM.createRelative(10),
            UInt64.fromUint(480),
            signedTransaction,
            NetworkType.MIJIN_TEST
        );
        const signedLockFundsTransaction = accountG.sign(lockFundsTransaction);
        resolve([signedTransaction.payload, signedLockFundsTransaction.payload]);
    });
}

function createCommitmentTransaction(multisigPublicAccount, account1, publicAccount2, accountG, amount1, amount2, hashedSecret) {
    return new Promise((resolve, reject) => {
        const account1Tx = TransferTransaction.create(
            Deadline.create(),
            account1.address,
            [XEM.createRelative(amount1)],
            PlainMessage.create(`commitment tx ${amount1}XEM`),
            NetworkType.MIJIN_TEST,
        );
        const account2Tx = TransferTransaction.create(
            Deadline.create(),
            publicAccount2.address,
            [XEM.createRelative(amount2)],
            PlainMessage.create(`commitment tx ${amount2}XEM`),
            NetworkType.MIJIN_TEST,
        );
        const secretLockTx = SecretLockTransaction.create(
            Deadline.create(),
            XEM.createRelative(amount2),
            UInt64.fromUint(1000 * 10),
            HashType.SHA3_512,
            hashedSecret,
            account1.address,
            NetworkType.MIJIN_TEST
        );
        const commitmentTransaction = AggregateTransaction.createBonded(
            Deadline.create(),
            [
                account1Tx.toAggregate(multisigPublicAccount),
                account2Tx.toAggregate(multisigPublicAccount),
                secretLockTx.toAggregate(publicAccount2),
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = account1.sign(commitmentTransaction);
        const lockFundsTransaction = LockFundsTransaction.create(
            Deadline.create(),
            XEM.createRelative(10),
            UInt64.fromUint(480),
            signedTransaction,
            NetworkType.MIJIN_TEST
        );
        const signedLockFundsTransaction = accountG.sign(lockFundsTransaction);
        resolve([signedTransaction.payload, signedLockFundsTransaction.payload]);
    });
}

function sendOpeningTransaction(payloads, address1, account2, addressG) {
    return sendAndCosignAggregateTransaction(payloads, address1, account2, addressG);
}

function sendCommitmentTransaction(payloads, address1, account2, addressG) {
    return sendAndCosignAggregateTransaction(payloads, address1, account2, addressG);
}

function sendAndCosignAggregateTransaction(payloads, address1, account2, addressG) {
    return new Promise((resolve, reject) => {
        const calcurateTransactionHash = function(payload) {
            const hashInputPayload =
                payload.substr(4*2,32*2) +
                payload.substr((4+64)*2,32*2) +
                payload.substr((4+64+32)*2);
            const hasher = sha3_256.create();
            return hasher.update(Buffer.from(hashInputPayload, 'hex')).hex().toUpperCase();
        }
        const cosignAggregateBondedTransaction = function(transaction, account) {
            const cosignatureTransaction = CosignatureTransaction.create(transaction);
            const signedTransaction = account.signCosignatureTransaction(cosignatureTransaction);
            return signedTransaction;
        }
        const payload = payloads[0];
        const hash = calcurateTransactionHash(payload);
        const lockFundsTxPayload = payloads[1];
        const lockFundsTxHash = calcurateTransactionHash(lockFundsTxPayload);
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            return new Promise((resolveReq, rejectReq) => {
                console.log(lockFundsTxHash);
                request({
                    url: `${ENDPOINT}/transaction`,
                    method: 'PUT',
                    headers: {
                        'Content-Type':'application/json'
                    },
                    json: {"payload": lockFundsTxPayload}
                }, (error, response, body) => {
                    console.log(body);
                    error ? rejectReq(error) : resolveReq();
                });
            });
        }).then(() => {
            listener.confirmed(addressG).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === lockFundsTxHash),
                flatMap(ignored => rx.from(new Promise((resolveReq, rejectReq) => {
                    console.log(hash);
                    request({
                        url: `${ENDPOINT}/transaction/partial`,
                        method: 'PUT',
                        headers: {
                            'Content-Type':'application/json'
                        },
                        json: {payload}
                    }, (error, response, body) => {
                        error ? rejectReq(error) : resolveReq(body);
                    });
                })))
            ).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.aggregateBondedAdded(account2.address).pipe(
                filter((_) => !_.signedByAccount(account2.publicAccount)),
                map(transaction => cosignAggregateBondedTransaction(transaction, account2)),
                flatMap(cosignatureSignedTransaction => transactionHttp.announceAggregateBondedCosignature(cosignatureSignedTransaction))
            ).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(address1).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === hash)
            ).subscribe(
                ignore => {
                    listener.close();
                    resolve();
                },
                err => console.error(err)
            );
        }).catch((error) => {
            console.error(error);
        });
    });
}

function sendGetBackTransaction(secret, account) {
    return new Promise((resolve, reject) => {
        const hashedSecret = sha3_512.create().update(secret).hex().toUpperCase();
        const secretProofTransaction = SecretProofTransaction.create(
            Deadline.create(),
            HashType.SHA3_512,
            hashedSecret,
            secret.toString('hex'),
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = account.sign(secretProofTransaction);
        console.log(signedTransaction.hash);
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            transactionHttp.announce(signedTransaction).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(account.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedTransaction.hash)
            ).subscribe(
                ignore => {
                    listener.close();
                    resolve();
                },
                error => reject(error)
            );
        }).catch((error) => {
            console.error(error);
        });
    });
}

function showXEMBalance(addressM, address1, address2) {
    return new Promise((resolve, reject) => {
        const accountHttp = new AccountHttp(ENDPOINT);
        rx.zip(
            accountHttp.getAccountInfo(addressM),
            accountHttp.getAccountInfo(address1),
            accountHttp.getAccountInfo(address2)
        ).pipe(
            map(accountsInfo => {
                return accountsInfo.map(accountInfo => {
                    if (accountInfo.mosaics.length === 0) {
                        return XEM.createRelative(0);
                    } else {
                        return accountInfo.mosaics.filter(mosaic => mosaic.id.toHex() === "d525ad41d95fcf29")[0];
                    }
                });
            })
        ).subscribe(
            x => {
                console.log(x.map(mosaic => mosaic.amount.compact()));
                resolve(x);
            },
            error => reject(error)
        );
    });
}

const multisigAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);
const aliceAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);
const bobAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);

const guarantorPrivateKey = '25B3F54217340F7061D02676C4B928ADB4395EB70A2A52D2A11E2F4AE011B03E';
const guarantorAccount = Account.createFromPrivateKey(guarantorPrivateKey, NetworkType.MIJIN_TEST);

execute();

async function execute() {
    console.log("=== send XEM first ===");
    await sendXEMFirst(aliceAccount.address, bobAccount.address, guarantorAccount);
    console.log("=== create multisig account ===");
    await createMultisigAccount(multisigAccount, aliceAccount.publicAccount, bobAccount.publicAccount);
    console.log("=== show balance [Multisig, Alice, Bob] ===");
    await showXEMBalance(multisigAccount.address, aliceAccount.address, bobAccount.address);
    console.log("=== create opning transaction payload ===");
    const opTxPayloads = await createOpeningTransaction(multisigAccount.publicAccount, aliceAccount, bobAccount.publicAccount, guarantorAccount);
    console.log("=== create commitment 1 transaction payload ===");
    const secret1 = crypto.randomBytes(10);
    const hashedSecret1 = sha3_512.create().update(secret1).hex().toUpperCase();
    const cmTxPayloads1 = await createCommitmentTransaction(multisigAccount.publicAccount, aliceAccount, bobAccount.publicAccount, guarantorAccount, 4, 6, hashedSecret1);
    console.log("=== send opening transaction ===");
    await sendOpeningTransaction(opTxPayloads, aliceAccount.address, bobAccount, guarantorAccount.address);
    console.log("=== show balance [Multisig, Alice, Bob] ===");
    await showXEMBalance(multisigAccount.address, aliceAccount.address, bobAccount.address);
    console.log("=== create commitment 2 transaction payload ===");
    const secret2 = crypto.randomBytes(10);
    const hashedSecret2 = sha3_512.create().update(secret2).hex().toUpperCase();
    const cmTxPayloads2 = await createCommitmentTransaction(multisigAccount.publicAccount, aliceAccount, bobAccount.publicAccount, guarantorAccount, 4, 6, hashedSecret2);
    console.log("=== cheat (send old commitment transaction) ===");
    await sendCommitmentTransaction(cmTxPayloads1, aliceAccount.address, bobAccount, guarantorAccount.address);
    console.log("=== show balance [Multisig, Alice, Bob] ===");
    await showXEMBalance(multisigAccount.address, aliceAccount.address, bobAccount.address);
    console.log("=== penalty (collect all XEM) ===");
    await sendGetBackTransaction(secret1, aliceAccount);
    console.log("=== show balance [Multisig, Alice, Bob] ===");
    await showXEMBalance(multisigAccount.address, aliceAccount.address, bobAccount.address);
}


