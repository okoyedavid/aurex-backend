import { Request, Response } from "express";

const getHealth = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "Aurex Backend Running!!",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

export { getHealth };
