const nem2Sdk = require("nem2-sdk");
const crypto = require("crypto");
const jssha3 = require('js-sha3');
const rx = require('rxjs');
const op = require('rxjs/operators');

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

const ENDPOINT = "http://catapult48gh23s.xyz:3000";

function sendXEMFirst(publicAccount1, publicAccount2, accountG) {
    return new Promise((resolve, reject) => {
        const publicAccount1Tx = TransferTransaction.create(
            Deadline.create(),
            publicAccount1.address,
            [XEM.createRelative(5)],
            PlainMessage.create('send first 5XEM'),
            NetworkType.MIJIN_TEST,
        );
        const publicAccount2Tx = TransferTransaction.create(
            Deadline.create(),
            publicAccount2.address,
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

function createOpeningTransaction(multisigPublicAccount, account1, account2, accountG) {
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
                publicAccount2Tx.toAggregate(account2.publicAccount),
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = account1.sign(opningTransaction);
        console.log(signedTransaction.hash);
        const lockFundsTransaction = LockFundsTransaction.create(
            Deadline.create(),
            XEM.createRelative(10),
            UInt64.fromUint(480),
            signedTransaction,
            NetworkType.MIJIN_TEST
        );
        const signedLockFundsTransaction = accountG.sign(lockFundsTransaction);
        console.log(signedLockFundsTransaction.hash);
        const cosignAggregateBondedTransaction = function(transaction, account) {
            const cosignatureTransaction = CosignatureTransaction.create(transaction);
            const signedTransaction = account.signCosignatureTransaction(cosignatureTransaction);
            return signedTransaction;
        };
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            transactionHttp.announce(signedLockFundsTransaction).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(accountG.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedLockFundsTransaction.hash),
                flatMap(ignored => transactionHttp.announceAggregateBonded(signedTransaction))
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
            listener.confirmed(account1.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedTransaction.hash)
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

function createCommitmentTransaction(multisigPublicAccount, account1, account2, accountG, amount1, amount2, secret) {
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
            account2.address,
            [XEM.createRelative(amount2)],
            PlainMessage.create(`commitment tx ${amount2}XEM`),
            NetworkType.MIJIN_TEST,
        );
        const secretLockTx = SecretLockTransaction.create(
            Deadline.create(),
            XEM.createRelative(amount2),
            UInt64.fromUint(1000 * 10),
            HashType.SHA3_512,
            secret,
            account1.address,
            NetworkType.MIJIN_TEST
        );
        const commitmentTransaction = AggregateTransaction.createBonded(
            Deadline.create(),
            [
                account1Tx.toAggregate(multisigPublicAccount),
                account2Tx.toAggregate(multisigPublicAccount),
                secretLockTx.toAggregate(account2.publicAccount),
            ],
            NetworkType.MIJIN_TEST
        );
        const signedTransaction = account1.sign(commitmentTransaction);
        console.log(signedTransaction.hash);
        const lockFundsTransaction = LockFundsTransaction.create(
            Deadline.create(),
            XEM.createRelative(10),
            UInt64.fromUint(480),
            signedTransaction,
            NetworkType.MIJIN_TEST
        );
        const signedLockFundsTransaction = accountG.sign(lockFundsTransaction);
        console.log(signedLockFundsTransaction.hash);
        const cosignAggregateBondedTransaction = function(transaction, account) {
            const cosignatureTransaction = CosignatureTransaction.create(transaction);
            const signedTransaction = account.signCosignatureTransaction(cosignatureTransaction);
            return signedTransaction;
        };
        const listener = new Listener(ENDPOINT);
        const transactionHttp = new TransactionHttp(ENDPOINT);
        listener.open().then(() => {
            transactionHttp.announce(signedLockFundsTransaction).subscribe(
                x => console.log(x),
                err => console.error(err)
            );
            listener.confirmed(accountG.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedLockFundsTransaction.hash),
                flatMap(ignored => transactionHttp.announceAggregateBonded(signedTransaction))
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
            listener.confirmed(account1.address).pipe(
                filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedTransaction.hash)
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

const multisigAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);
const aliceAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);
const bobAccount = Account.generateNewAccount(NetworkType.MIJIN_TEST);

const guarantorPrivateKey = '25B3F54217340F7061D02676C4B928ADB4395EB70A2A52D2A11E2F4AE011B03E';
const guarantorAccount = Account.createFromPrivateKey(guarantorPrivateKey, NetworkType.MIJIN_TEST);

execute();

async function execute() {
    await sendXEMFirst(aliceAccount.publicAccount, bobAccount.publicAccount, guarantorAccount);
    await createMultisigAccount(multisigAccount, aliceAccount.publicAccount, bobAccount.publicAccount);
    await createOpeningTransaction(multisigAccount.publicAccount, aliceAccount, bobAccount, guarantorAccount);
    const random = crypto.randomBytes(10);
    const secret = sha3_512.create().update(random).hex().toUpperCase();
    await createCommitmentTransaction(multisigAccount.publicAccount, aliceAccount, bobAccount, guarantorAccount, 4, 6, secret);
    console.log("finish");
}
