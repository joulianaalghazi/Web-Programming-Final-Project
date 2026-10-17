const express = require("express");
const router = express.Router();
const db = require("../student_db");

// POST /student/login
router.post("/login", (req, res) => {

  const { email, password } = req.body;

  // Check required fields
  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password required"
    });
  }

  const sql = `
    SELECT id, name, email, password, role, is_active
    FROM users
    WHERE email = ? AND role = 'student'
    LIMIT 1
  `;

  db.query(sql, [email], (err, results) => {

    if (err) {
      console.log("Login query error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // No matching student found
    if (results.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = results[0];

    // Check if account is active
    if (user.is_active !== 1) {
      return res.status(403).json({
        error: "Account is inactive"
      });
    }

    // Password check (plain text for now since DB uses plain text)
    if (user.password !== password) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    // Success
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

// POST /student/signup
router.post("/register", (req, res) => {

  const { firstName, lastName, email, password } = req.body;

  // Validate fields
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      error: "All fields are required"
    });
  }

  const name = `${firstName} ${lastName}`;

  // Check if email already exists
  const checkSql = `
    SELECT id
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(checkSql, [email], (err, results) => {

    if (err) {
      console.log("Signup email check error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length > 0) {
      return res.status(400).json({
        error: "Email already exists"
      });
    }

    // Insert student
    const insertSql = `
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, 'student')
    `;

    db.query(insertSql, [name, email, password], (err, result) => {

      if (err) {
        console.log("Signup insert error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Account created successfully"
      });

    });

  });

});


module.exports = router;