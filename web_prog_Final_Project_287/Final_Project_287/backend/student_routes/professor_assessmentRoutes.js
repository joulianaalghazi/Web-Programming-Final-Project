const express = require("express");
const router = express.Router();
const db = require("../student_db");

// GET all assessments (professor view)
router.get("/", (req, res) => {
  const sql = `
    SELECT
      a.id,
      a.course_id,
      a.title,
      a.category,
      a.weight,
      a.total_marks,
      a.due_date,
      a.created_at
    FROM assessments a
    ORDER BY a.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("Get professor assessments error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// GET one assessment by id
router.get("/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT
      a.id,
      a.course_id,
      a.title,
      a.category,
      a.weight,
      a.total_marks,
      a.due_date,
      a.created_at
    FROM assessments a
    WHERE a.id = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.log("Get single assessment error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json(results[0]);
  });
});

// CREATE assessment
router.post("/", (req, res) => {
  const { course_id, title, category, weight, total_marks, due_date } = req.body;

  if (!course_id || !title || !category || total_marks === undefined || total_marks === null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const safeCategory = ["Assignment", "Quiz", "Lab", "Project", "Exam"].includes(category)
    ? category
    : "Assignment";

  const sql = `
    INSERT INTO assessments
      (course_id, title, category, weight, total_marks, due_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      course_id,
      title,
      safeCategory,
      weight || 0,
      total_marks,
      due_date || null
    ],
    (err, result) => {
      if (err) {
        console.log("Create assessment error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        id: result.insertId,
        course_id,
        title,
        category: safeCategory,
        weight: weight || 0,
        total_marks,
        due_date: due_date || null
      });
    }
  );
});

// UPDATE assessment
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { course_id, title, category, weight, total_marks, due_date } = req.body;

  if (!course_id || !title || !category || total_marks === undefined || total_marks === null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const safeCategory = ["Assignment", "Quiz", "Lab", "Project", "Exam"].includes(category)
    ? category
    : "Assignment";

  const sql = `
    UPDATE assessments
    SET
      course_id = ?,
      title = ?,
      category = ?,
      weight = ?,
      total_marks = ?,
      due_date = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      course_id,
      title,
      safeCategory,
      weight || 0,
      total_marks,
      due_date || null,
      id
    ],
    (err, result) => {
      if (err) {
        console.log("Update assessment error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      res.json({
        id: Number(id),
        course_id,
        title,
        category: safeCategory,
        weight: weight || 0,
        total_marks,
        due_date: due_date || null
      });
    }
  );
});

// DELETE assessment
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM assessments WHERE id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.log("Delete assessment error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json({ message: "Assessment deleted successfully" });
  });
});

// GET enrolled students for ONE assessment's course only
router.get("/:id/students", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT
      u.id AS student_id,
      u.name,
      u.email,
      a.id AS assessment_id,
      a.title,
      a.total_marks,
      COALESCE(sa.earned_marks, 0) AS earned_marks,
      COALESCE(sa.status, 'Pending') AS status
    FROM assessments a
    INNER JOIN student_courses sc
      ON sc.course_id = a.course_id
    INNER JOIN users u
      ON u.id = sc.student_id
    LEFT JOIN student_assessments sa
      ON sa.student_id = sc.student_id
      AND sa.assessment_id = a.id
    WHERE a.id = ?
      AND u.role = 'student'
    ORDER BY u.name ASC
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.log("Get assessment students error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// SAVE/UPDATE one student's grade for one assessment
router.put("/:id/grades", (req, res) => {
  const { id } = req.params;
  const { student_id, earned_marks, status } = req.body;

  if (!student_id || earned_marks === undefined || earned_marks === null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const safeStatus = status || "Completed";

  const checkSql = `
    SELECT
      a.id AS assessment_id,
      sc.student_id
    FROM assessments a
    INNER JOIN student_courses sc
      ON sc.course_id = a.course_id
    WHERE a.id = ? AND sc.student_id = ?
  `;

  db.query(checkSql, [id, student_id], (checkErr, checkResults) => {
    if (checkErr) {
      console.log("Check enrolled student for assessment error:", checkErr);
      return res.status(500).json({ error: "Database error" });
    }

    if (checkResults.length === 0) {
      return res.status(400).json({ error: "Student is not enrolled in this assessment's course" });
    }

    const upsertSql = `
      INSERT INTO student_assessments
        (student_id, assessment_id, earned_marks, status)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        earned_marks = VALUES(earned_marks),
        status = VALUES(status)
    `;

    db.query(
      upsertSql,
      [student_id, id, earned_marks, safeStatus],
      (err) => {
        if (err) {
          console.log("Save grade error:", err);
          return res.status(500).json({ error: "Database error" });
        }

        res.json({
          message: "Grade saved successfully",
          assessment_id: Number(id),
          student_id,
          earned_marks,
          status: safeStatus
        });
      }
    );
  });
});

module.exports = router;