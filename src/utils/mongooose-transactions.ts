import mongoose, { type ClientSession } from "mongoose";

type TransactionWork<T> = (mongoSession: ClientSession) => Promise<T>;

const withTransaction = async <T>(work: TransactionWork<T>): Promise<T> => {
  const mongoSession = await mongoose.startSession();

  try {
    const result = await mongoSession.withTransaction(async () => {
      return work(mongoSession);
    });

    return result as T;
  } finally {
    await mongoSession.endSession();
  }
};

export { withTransaction };

export type WithTransaction = <T>(work: TransactionWork<T>) => Promise<T>;
