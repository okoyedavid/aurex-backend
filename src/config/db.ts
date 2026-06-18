import mongoose from "mongoose";

const connectToDatabase = async (mongoUri: string) => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
};

export { connectToDatabase };
