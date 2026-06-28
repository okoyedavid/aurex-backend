import mongoose, { InferSchemaType } from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    employeeListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeList",
      required: true,
      index: true,
    },
    fullName: { type: String, trim: true, required: true },
    jobTitle: { type: String, trim: true, required: false },
    bankCode: { type: String, trim: true, required: true },
    bankName: { type: String, trim: true, required: true },
    accountNumber: { type: String, trim: true, required: true },
    accountName: { type: String, trim: true },
    accountVerificationStatus: {
      type: String,
      enum: ["unverified", "verified", "failed", "stale"],
      default: "unverified",
      index: true,
    },
    verificationJobStatus: {
      type: String,
      enum: ["pending", "processing", "retrying", "completed", "exhausted"],
      default: "pending",
      index: true,
    },
    verificationMode: {
      type: String,
      enum: ["demo", "live"],
    },
    verificationAttemptCount: { type: Number, default: 0, min: 0 },
    accountVerifiedAt: { type: Date },
    accountVerificationFailureReason: { type: String, trim: true },
    lastAccountValidationAt: { type: Date },
    nextVerificationAttemptAt: { type: Date },
    amount: { type: Number, required: true, min: 0 },
    payFrequency: {
      type: String,
      trim: true,
      enum: ["weekly", "bi-weekly", "monthly", "one_time"],
      default: "monthly",
    },
    totalAmountPaid: { type: Number, default: 0, min: 0 },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,

      default: "NGN",
    },
    lastPaidAt: { type: Date },
    paymentStatus: {
      type: String,
      enum: ["payable", "blocked"],
      default: "blocked",
      index: true,
    },
    paymentBlockedReason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "suspended", "on leave", "archived"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

employeeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const employee = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (employee._id) {
      employee.id = employee._id.toString();
    }

    delete employee._id;
    return ret;
  },
});

employeeSchema.index({ businessId: 1, status: 1 });
employeeSchema.index({ businessId: 1, employeeListId: 1, status: 1 });
employeeSchema.index({
  businessId: 1,
  employeeListId: 1,
  accountVerificationStatus: 1,
  paymentStatus: 1,
});
employeeSchema.index({ businessId: 1, accountNumber: 1 });
employeeSchema.index({
  verificationJobStatus: 1,
  nextVerificationAttemptAt: 1,
  createdAt: 1,
});

export type EmployeeDocument = InferSchemaType<typeof employeeSchema>;
export const Employee = mongoose.model<EmployeeDocument>(
  "Employee",
  employeeSchema,
);
