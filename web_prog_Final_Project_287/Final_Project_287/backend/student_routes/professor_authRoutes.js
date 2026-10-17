const express = require("express");
const router = express.Router();
const db = require("../student_db");

// POST /professor/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password required"
    });
  }

  const sql = `
    SELECT id, name, email, password, role, is_active
    FROM users
    WHERE email = ? AND role = 'professor'
    LIMIT 1
  `;

  db.query(sql, [email], (err, results) => {
    if (err) {
      console.log("Professor login error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = results[0];

    if (user.is_active !== 1) {
      return res.status(403).json({
        error: "Account inactive"
      });
    }

    if (user.password !== password) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  });
});

// POST /professor/register
router.post("/register", (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      error: "All fields are required"
    });
  }

  const fullName = `${firstName} ${lastName}`;

  const checkSql = `
    SELECT id
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(checkSql, [email], (err, results) => {
    if (err) {
      console.log("Professor register email check error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length > 0) {
      return res.status(400).json({
        error: "Email already exists"
      });
    }

    const insertSql = `
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, 'professor')
    `;

    db.query(insertSql, [fullName, email, password], (err, result) => {
      if (err) {
        console.log("Professor register insert error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      return res.status(201).json({
        message: "Professor account created successfully"
      });
    });
  });
});

module.exports = router;