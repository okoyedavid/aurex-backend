import { banksList } from "./bank-list.js";

type ListBanksInput = {
  country?: string;
  q?: string;
  type?: string;
};

type ResolveBankAccountInput = {
  accountNumber: string;
  bankCode: string;
};

type CreatePayStackDependencies = {
  baseUrl: string;
  secretKey?: string;
  verificationMode: "demo" | "live";
  testBankCode: string;
};

type PaystackResolveBody = {
  status?: boolean;
  message?: string;
  code?: string;
  data?: {
    account_number?: string;
    account_name?: string;
    bank_id?: number;
  };
};

export type BankAccountResolution =
  | {
      outcome: "verified";
      statusCode: number;
      data: { accountNumber: string; accountName: string; bankId?: number };
    }
  | {
      outcome: "invalid" | "retryable_error";
      statusCode: number;
      data: null;
      reason: string;
    };

const createPaystackService = ({
  baseUrl,
  secretKey,
  verificationMode,
  testBankCode,
}: CreatePayStackDependencies) => {
  const resolveBankAccount = async ({
    accountNumber,
    bankCode,
  }: ResolveBankAccountInput) => {
    if (!secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required");
    }

    const url = new URL("/bank/resolve", baseUrl);
    url.searchParams.set("account_number", accountNumber);
    url.searchParams.set(
      "bank_code",
      verificationMode === "demo" ? testBankCode : bankCode,
    );

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${secretKey}`,
      },
    });
    const body = (await res.json()) as PaystackResolveBody;

    if (
      res.ok &&
      body.data?.account_number &&
      body.data.account_name
    ) {
      return {
        outcome: "verified" as const,
        statusCode: res.status,
        data: {
          accountNumber: body.data.account_number,
          accountName: body.data.account_name,
          bankId: body.data.bank_id,
        },
      };
    }

    const retryable =
      res.status === 429 || res.status >= 500 || body.code === "rate_limited";

    return {
      outcome: retryable ? ("retryable_error" as const) : ("invalid" as const),
      data: null,
      reason: body.message ?? "Bank account could not be resolved",
      statusCode: res.status,
    };
  };

  const listBanks = ({ country, q, type }: ListBanksInput = {}) => {
    const search = q?.trim().toLowerCase();
    const normalizedCountry = country?.trim().toLowerCase();
    const normalizedType = type?.trim().toLowerCase();

    return banksList.filter((bank) => {
      const matchesCountry = normalizedCountry
        ? bank.country.toLowerCase() === normalizedCountry
        : true;
      const matchesType = normalizedType
        ? bank.type.toLowerCase() === normalizedType
        : true;
      const matchesSearch = search
        ? bank.name.toLowerCase().includes(search) ||
          bank.code.toLowerCase().includes(search) ||
          bank.slug.toLowerCase().includes(search)
        : true;

      return matchesCountry && matchesType && matchesSearch;
    });
  };

  const fetchPaystackBanks = async () => {
    if (!secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required");
    }

    const url = new URL("/bank", baseUrl);
    url.searchParams.set("country", "nigeria");
    url.searchParams.set("perPage", "300");

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${secretKey}`,
      },
    });

    return res.json();
  };

  return {
    fetchPaystackBanks,
    isConfigured: () => Boolean(secretKey),
    listBanks,
    resolveBankAccount,
    verificationMode,
  };
};

export type PaystackService = ReturnType<typeof createPaystackService>;

export { createPaystackService };
