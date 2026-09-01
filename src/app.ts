import express, { Application } from "express";
import v1Routes from "./routes/index";

const app: Application = express();

app.use(express.json());

app.use("/api/v1", v1Routes);

export default app;
