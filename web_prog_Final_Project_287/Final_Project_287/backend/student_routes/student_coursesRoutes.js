const express = require("express");
const router = express.Router();
const db = require("../student_db");

// GET enrolled courses for one student
router.get("/:studentId", (req, res) => {
  const { studentId } = req.params;

  const sql = `
    SELECT
      c.id,
      c.course_name AS name,
      c.course_code AS code,
      c.instructor_name,
      c.term,
      c.section,
      c.template_name,
      CASE
        WHEN c.enabled = 1 THEN 'Active'
        ELSE 'Disabled'
      END AS status,
      c.description,
      c.created_by,
      c.created_at
    FROM student_courses sc
    JOIN courses c ON sc.course_id = c.id
    WHERE sc.student_id = ?
    ORDER BY c.course_name
  `;

  db.query(sql, [studentId], (err, results) => {
    if (err) {
      console.log("Get student courses error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// ENROLL student in a course
router.post("/", (req, res) => {
  const { student_id, course_id } = req.body;

  if (!student_id || !course_id) {
    return res.status(400).json({ error: "Missing student_id or course_id" });
  }

  const checkSql = `
    SELECT id
    FROM student_courses
    WHERE student_id = ? AND course_id = ?
  `;

  db.query(checkSql, [student_id, course_id], (err, results) => {
    if (err) {
      console.log("Check enrollment error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length > 0) {
      return res.status(409).json({ error: "Student already enrolled" });
    }

    const insertSql = `
      INSERT INTO student_courses (student_id, course_id)
      VALUES (?, ?)
    `;

    db.query(insertSql, [student_id, course_id], (insertErr, result) => {
      if (insertErr) {
        console.log("Enroll course error:", insertErr);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Course added successfully",
        id: result.insertId,
        student_id,
        course_id
      });
    });
  });
});

// DELETE enrolled course
router.delete("/:studentId/:courseId", (req, res) => {
  const { studentId, courseId } = req.params;

  const sql = `
    DELETE FROM student_courses
    WHERE student_id = ? AND course_id = ?
  `;

  db.query(sql, [studentId, courseId], (err, result) => {
    if (err) {
      console.log("Delete student course error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.json({ message: "Course removed successfully" });
  });
});

module.exports = router;