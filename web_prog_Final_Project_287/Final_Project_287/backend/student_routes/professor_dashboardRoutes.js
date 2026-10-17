const express = require("express");
const router = express.Router();
const db = require("../student_db");

// GET dashboard course list (only enabled courses, optionally filtered by professor)
router.get("/courses", (req, res) => {
  const { created_by } = req.query;

  let sql = `
    SELECT
      id,
      course_code AS code,
      course_name AS name,
      term,
      section
    FROM courses
    WHERE enabled = 1
  `;

  const params = [];

  if (created_by) {
    sql += ` AND created_by = ? `;
    params.push(created_by);
  }

  sql += ` ORDER BY id DESC `;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.log("Get dashboard courses error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// GET dashboard stats for one course
router.get("/stats/:courseId", (req, res) => {
  const { courseId } = req.params;

  const sql = `
    SELECT
      (
        SELECT COUNT(*)
        FROM student_courses sc
        INNER JOIN users u ON u.id = sc.student_id
        WHERE sc.course_id = ? AND u.role = 'student'
      ) AS enrolled_students,

      (
        SELECT COUNT(DISTINCT sub.student_id)
        FROM assessment_submissions sub
        INNER JOIN assessments a ON a.id = sub.assessment_id
        INNER JOIN users u ON u.id = sub.student_id
        WHERE a.course_id = ? AND u.role = 'student'
      ) AS students_submitted,

      (
        SELECT COUNT(*)
        FROM assessment_submissions sub
        INNER JOIN assessments a ON a.id = sub.assessment_id
        INNER JOIN users u ON u.id = sub.student_id
        WHERE a.course_id = ? AND u.role = 'student'
      ) AS submitted_items,

      (
        SELECT COUNT(*)
        FROM student_courses sc
        INNER JOIN users u ON u.id = sc.student_id
        INNER JOIN assessments a ON a.course_id = sc.course_id
        WHERE sc.course_id = ? AND u.role = 'student'
      ) AS total_expected_items,

      (
        SELECT COUNT(DISTINCT sc.student_id)
        FROM student_courses sc
        INNER JOIN users u ON u.id = sc.student_id
        INNER JOIN assessments a ON a.course_id = sc.course_id
        LEFT JOIN assessment_submissions sub
          ON sub.student_id = sc.student_id
          AND sub.assessment_id = a.id
        WHERE sc.course_id = ?
          AND u.role = 'student'
          AND a.due_date IS NOT NULL
          AND a.due_date < CURDATE()
          AND sub.id IS NULL
      ) AS students_not_submitted,

      (
        SELECT MIN(a.due_date)
        FROM assessments a
        WHERE a.course_id = ?
          AND a.due_date IS NOT NULL
          AND a.due_date >= CURDATE()
      ) AS next_deadline,

      (
        SELECT COUNT(*)
        FROM assessments a
        WHERE a.course_id = ?
      ) AS total_assessments
  `;

  db.query(
    sql,
    [courseId, courseId, courseId, courseId, courseId, courseId, courseId],
    (err, results) => {
      if (err) {
        console.log("Get dashboard stats error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const row = results[0] || {};
      const enrolled = Number(row.enrolled_students || 0);
      const submittedStudents = Number(row.students_submitted || 0);
      const submittedItems = Number(row.submitted_items || 0);
      const totalExpected = Number(row.total_expected_items || 0);
      const notSubmitted = Number(row.students_not_submitted || 0);
      const totalAssessments = Number(row.total_assessments || 0);

      const submittedStudentsPercent =
        enrolled === 0 ? 0 : Math.round((submittedStudents / enrolled) * 100);

      const submissionRate =
        totalExpected === 0 ? 0 : Math.round((submittedItems / totalExpected) * 100);

      const notSubmittedPercent =
        enrolled === 0 ? 0 : Math.round((notSubmitted / enrolled) * 100);

      res.json({
        enrolled_students: enrolled,
        submitted_students_percent: submittedStudentsPercent,
        submission_rate_percent: submissionRate,
        students_not_submitted_percent: notSubmittedPercent,
        next_deadline: row.next_deadline || null,
        total_assessments: totalAssessments
      });
    }
  );
});

// GET completion by assessment for one course
router.get("/assessment-completion/:courseId", (req, res) => {
  const { courseId } = req.params;

  const sql = `
    SELECT
      a.id,
      a.title,
      a.due_date,
      COUNT(DISTINCT sc.student_id) AS enrolled_students,
      COUNT(DISTINCT sub.student_id) AS submitted_students
    FROM assessments a
    LEFT JOIN student_courses sc
      ON sc.course_id = a.course_id
    LEFT JOIN assessment_submissions sub
      ON sub.assessment_id = a.id
      AND sub.student_id = sc.student_id
    WHERE a.course_id = ?
    GROUP BY a.id, a.title, a.due_date
    ORDER BY a.due_date IS NULL, a.due_date ASC, a.id ASC
  `;

  db.query(sql, [courseId], (err, results) => {
    if (err) {
      console.log("Get assessment completion error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const mapped = results.map((row) => {
      const enrolled = Number(row.enrolled_students || 0);
      const submitted = Number(row.submitted_students || 0);
      const completion_percent = enrolled === 0 ? 0 : Math.round((submitted / enrolled) * 100);

      return {
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        completion_percent
      };
    });

    res.json(mapped);
  });
});

// GET anonymized grouped progress distribution
router.get("/progress-distribution/:courseId", (req, res) => {
  const { courseId } = req.params;

  const sql = `
  SELECT
    sc.student_id,
    COUNT(a.id) AS total_assessments,
    COUNT(sub.id) AS submitted_assessments
  FROM student_courses sc
  LEFT JOIN assessments a
    ON a.course_id = sc.course_id
  LEFT JOIN assessment_submissions sub
    ON sub.student_id = sc.student_id
    AND sub.assessment_id = a.id
  WHERE sc.course_id = ?
  GROUP BY sc.student_id
`;

  db.query(sql, [courseId], (err, results) => {
    if (err) {
      console.log("Get progress distribution error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const totalStudents = results.length;

    let onTrack = 0;
    let oneBehind = 0;
    let twoPlusBehind = 0;
    let notSubmitted = 0;

    results.forEach((row) => {
      const totalAssessments = Number(row.total_assessments || 0);
const submittedAssessments = Number(row.submitted_assessments || 0);
const missing = Math.max(totalAssessments - submittedAssessments, 0);

if (missing === 0) {
  onTrack += 1;
} else if (missing === 1) {
  oneBehind += 1;
} else if (missing >= 2) {
  twoPlusBehind += 1;
}
    });

    const pct = (value) => (totalStudents === 0 ? 0 : Math.round((value / totalStudents) * 100));

    res.json([
      {
        group_name: "On track",
        description: "Submitted all assessments in this course",
        percent: pct(onTrack)
      },
      {
        group_name: "1 assessment behind",
        description: "Missing one assessment",
        percent: pct(oneBehind)
      },
      {
        group_name: "2+ assessments behind",
        description: "Missing multiple assessments",
        percent: pct(twoPlusBehind)
      },
      {
        group_name: "Not submitted",
        description: "No submissions after at least one deadline passed",
        percent: pct(notSubmitted)
      }
    ]);
  });
});

// GET upcoming deadlines for one course
router.get("/deadlines/:courseId", (req, res) => {
  const { courseId } = req.params;

  const sql = `
    SELECT
      a.id,
      a.title,
      a.due_date,
      c.course_code AS code
    FROM assessments a
    INNER JOIN courses c ON c.id = a.course_id
    WHERE a.course_id = ?
      AND a.due_date IS NOT NULL
    ORDER BY a.due_date ASC
    LIMIT 5
  `;

  db.query(sql, [courseId], (err, results) => {
    if (err) {
      console.log("Get dashboard deadlines error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

module.exports = router;