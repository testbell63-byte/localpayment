import express from "express";
import Database from "better-sqlite3";
import path from "path";

const router = express.Router();
const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH);

// Get all payments
router.get("/payments", (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT * FROM payments 
      ORDER BY created_at DESC
    `).all();
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Get dashboard summary data
router.get("/summary", (req, res) => {
  try {
    const totalAmount = db.prepare("SELECT SUM(amount) as total FROM payments").get().total || 0;
    const totalPoints = db.prepare("SELECT SUM(points) as total FROM payments").get().total || 0;
    const transactionCount = db.prepare("SELECT COUNT(*) as count FROM payments").get().count || 0;

    const gameBreakdown = db.prepare(`
      SELECT game, SUM(points) as points 
      FROM payments 
      GROUP BY game
    `).all();

    res.json({
      totalAmount: Number(totalAmount),
      totalPoints: Number(totalPoints),
      transactionCount,
      gameBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

export default router;
