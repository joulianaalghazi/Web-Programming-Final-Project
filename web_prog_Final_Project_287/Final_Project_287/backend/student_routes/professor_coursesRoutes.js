const express = require("express");
const router = express.Router();
const db = require("../student_db");

// GET courses
// - If created_by is passed: return only that professor's courses
// - If created_by is not passed: return all enabled courses (student/public use)
router.get("/", (req, res) => {
  const { created_by } = req.query;

  let sql = "";
  let params = [];

  if (created_by) {
    sql = `
      SELECT
        id,
        course_name AS name,
        course_code AS code,
        instructor_name,
        term,
        section,
        template_name,
        CASE
          WHEN enabled = 1 THEN 'Active'
          ELSE 'Disabled'
        END AS status,
        description,
        created_by,
        created_at
      FROM courses
      WHERE created_by = ?
      ORDER BY id DESC
    `;
    params = [created_by];
  } else {
    sql = `
      SELECT
        id,
        course_name AS name,
        course_code AS code,
        instructor_name,
        term,
        section,
        template_name,
        CASE
          WHEN enabled = 1 THEN 'Active'
          ELSE 'Disabled'
        END AS status,
        description,
        created_by,
        created_at
      FROM courses
      WHERE enabled = 1
      ORDER BY id DESC
    `;
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.log("Get courses error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// GET one course by id (professor-owned)
router.get("/:id", (req, res) => {
  const { id } = req.params;
  const { created_by } = req.query;

  if (!created_by) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const sql = `
    SELECT
      id,
      course_name AS name,
      course_code AS code,
      instructor_name,
      term,
      section,
      template_name,
      CASE
        WHEN enabled = 1 THEN 'Active'
        ELSE 'Disabled'
      END AS status,
      description,
      created_by,
      created_at
    FROM courses
    WHERE id = ? AND created_by = ?
  `;

  db.query(sql, [id, created_by], (err, results) => {
    if (err) {
      console.log("Get single course error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(results[0]);
  });
});

// CREATE course
router.post("/", (req, res) => {
  const {
    name,
    code,
    term,
    section,
    status,
    description,
    template_name,
    created_by,
    instructor_name
  } = req.body;

  if (!name || !code || !term || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const enabled = status === "Active" ? 1 : 0;

  const sql = `
    INSERT INTO courses
    (
      course_name,
      course_code,
      instructor_name,
      term,
      section,
      enabled,
      description,
      template_name,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      name,
      code,
      instructor_name || "",
      term,
      section || "",
      enabled,
      description || "",
      template_name || null,
      created_by || null
    ],
    (err, result) => {
      if (err) {
        console.log("Create course error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        id: result.insertId,
        name,
        code,
        instructor_name: instructor_name || "",
        term,
        section: section || "",
        template_name: template_name || null,
        status,
        description: description || "",
        created_by: created_by || null
      });
    }
  );
});

// UPDATE course
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    name,
    code,
    term,
    section,
    status,
    description,
    template_name,
    instructor_name,
    created_by
  } = req.body;

  if (!name || !code || !term || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!created_by) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const enabled = status === "Active" ? 1 : 0;

  const sql = `
    UPDATE courses
    SET
      course_name = ?,
      course_code = ?,
      instructor_name = ?,
      term = ?,
      section = ?,
      enabled = ?,
      description = ?,
      template_name = ?
    WHERE id = ? AND created_by = ?
  `;

  db.query(
    sql,
    [
      name,
      code,
      instructor_name || "",
      term,
      section || "",
      enabled,
      description || "",
      template_name || null,
      id,
      created_by
    ],
    (err, result) => {
      if (err) {
        console.log("Update course error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json({
        id: Number(id),
        name,
        code,
        instructor_name: instructor_name || "",
        term,
        section: section || "",
        template_name: template_name || null,
        status,
        description: description || "",
        created_by
      });
    }
  );
});

// DELETE course
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const { created_by } = req.query;

  if (!created_by) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const sql = `
    DELETE FROM courses
    WHERE id = ? AND created_by = ?
  `;

  db.query(sql, [id, created_by], (err, result) => {
    if (err) {
      console.log("Delete course error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ message: "Course deleted successfully" });
  });
});

module.exports = router;