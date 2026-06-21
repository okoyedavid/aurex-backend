import { createEmailService } from "./email.service.js";

import { createHttpError } from "../../utils/api-error.js";

const emailService = createEmailService({
  createHttpError,
});

export { emailService };
