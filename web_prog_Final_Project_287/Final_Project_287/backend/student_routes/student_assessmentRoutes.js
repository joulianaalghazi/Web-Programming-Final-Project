console.log("LOADED student_assessmentRoutes.js");

const express = require("express");
const router = express.Router();
const db = require("../student_db");

// GET all assessments (professor/admin use)
router.get("/", (req, res) => {
  const sql = `
    SELECT
      id,
      course_id,
      title,
      category,
      weight,
      total_marks,
      due_date,
      created_at
    FROM assessments
    ORDER BY id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Get assessments error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// CREATE assessment (professor/admin use)
router.post("/", (req, res) => {
  const {
    course_id,
    title,
    category,
    weight,
    total_marks,
    due_date
  } = req.body;

  if (!course_id || !title || !category || total_marks === undefined || total_marks === null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

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
      category,
      weight || 0,
      total_marks,
      due_date || null
    ],
    (err, result) => {
      if (err) {
        console.error("Create assessment error:", err);
        return res.status(500).json({ error: "Database error while creating assessment" });
      }

      res.json({
        id: result.insertId,
        course_id,
        title,
        category,
        weight: weight || 0,
        total_marks,
        due_date: due_date || null
      });
    }
  );
});

// UPDATE assessment (professor/admin use)
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    course_id,
    title,
    category,
    weight,
    total_marks,
    due_date
  } = req.body;

  if (!course_id || !title || !category || total_marks === undefined || total_marks === null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

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
      category,
      weight || 0,
      total_marks,
      due_date || null,
      id
    ],
    (err, result) => {
      if (err) {
        console.error("Update assessment error:", err);
        return res.status(500).json({ error: "Database error while updating assessment" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      res.json({
        id: Number(id),
        course_id,
        title,
        category,
        weight: weight || 0,
        total_marks,
        due_date: due_date || null
      });
    }
  );
});

// DELETE assessment (professor/admin use)
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM assessments WHERE id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Delete assessment error:", err);
      return res.status(500).json({ error: "Database error while deleting assessment" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json({ message: "Assessment deleted successfully" });
  });
});

// GET average for one student's enrolled course only
router.get("/average/:studentId/:courseId", (req, res) => {
  const { studentId, courseId } = req.params;

  const sql = `
    SELECT
      a.total_marks,
      COALESCE(sa.earned_marks, 0) AS earned_marks
    FROM student_courses sc
    INNER JOIN assessments a
      ON a.course_id = sc.course_id
    LEFT JOIN student_assessments sa
      ON sa.assessment_id = a.id
      AND sa.student_id = sc.student_id
    WHERE sc.student_id = ? AND sc.course_id = ?
  `;

  db.query(sql, [studentId, courseId], (err, assessments) => {
    if (err) {
      console.error("Get average error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    let total = 0;
    let max = 0;

    assessments.forEach((a) => {
      total += Number(a.earned_marks || 0);
      max += Number(a.total_marks || 0);
    });

    const average = max === 0 ? 0 : (total / max) * 100;

    res.json({ average });
  });
});

  // GET dashboard upcoming pending assessments across all enrolled courses
router.get("/dashboard/:studentId", (req, res) => {
  const { studentId } = req.params;

  const sql = `
    SELECT
      c.course_code,
      a.title,
      a.due_date,
      COALESCE(sa.status, 'Pending') AS assessment_status,
      sub.status AS submission_status
    FROM student_courses sc
    INNER JOIN courses c
      ON c.id = sc.course_id
    INNER JOIN assessments a
      ON a.course_id = sc.course_id
    LEFT JOIN student_assessments sa
      ON sa.assessment_id = a.id
      AND sa.student_id = sc.student_id
    LEFT JOIN assessment_submissions sub
      ON sub.assessment_id = a.id
      AND sub.student_id = sc.student_id
    WHERE sc.student_id = ?
    ORDER BY a.due_date ASC, a.id ASC
  `;

  db.query(sql, [studentId], (err, results) => {
    if (err) {
      console.error("Dashboard assessments error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const pendingAssessments = results.filter(item => item.assessment_status !== "Completed");
    const completedAssessments = results.filter(item => item.assessment_status === "Completed");

    const upcomingAssessments = pendingAssessments.map(item => ({
      course: item.course_code,
      assessment: item.title,
      status: item.submission_status ? item.submission_status : "Pending",
      due_date: item.due_date
    }));

    res.json({
      pendingCount: pendingAssessments.length,
      doneCount: completedAssessments.length,
      upcomingAssessments
    });
  });
});
// GET full progress for one student across all enrolled courses
router.get("/progress/:studentId", (req, res) => {
  const { studentId } = req.params;

  const sql = `
    SELECT
      c.id AS course_id,
      c.course_code,
      c.course_name,
      c.term,
      c.section,
      a.id AS assessment_id,
      a.weight,
      a.total_marks,
      sa.earned_marks,
      sa.status AS student_assessment_status
    FROM student_courses sc
    INNER JOIN courses c
      ON c.id = sc.course_id
    LEFT JOIN assessments a
      ON a.course_id = c.id
    LEFT JOIN student_assessments sa
      ON sa.assessment_id = a.id
      AND sa.student_id = sc.student_id
    WHERE sc.student_id = ?
    ORDER BY c.id DESC, a.id ASC
  `;

  db.query(sql, [studentId], (err, results) => {
    if (err) {
      console.error("Get student progress error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (!results.length) {
      return res.json({
        courses: [],
        overallAverage: 0
      });
    }

    const courseMap = new Map();

    results.forEach((row) => {
      const courseId = Number(row.course_id);

      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course_id: courseId,
          course_code: row.course_code,
          course_name: row.course_name,
          term: row.term,
          section: row.section,
          weightedEarned: 0,
          gradedWeightTotal: 0,
          hasGrades: false
        });
      }

      const course = courseMap.get(courseId);

      if (!row.assessment_id) {
        return;
      }

      const weight = Number(row.weight || 0);
      const totalMarks = Number(row.total_marks || 0);
      const earnedMarks =
        row.earned_marks !== null && row.earned_marks !== undefined
          ? Number(row.earned_marks)
          : null;

      const isGraded =
        earnedMarks !== null &&
        totalMarks > 0 &&
        weight > 0 &&
        row.student_assessment_status === "Completed";

      if (isGraded) {
        const percentage = earnedMarks / totalMarks;
        const weightedContribution = percentage * weight;

        course.weightedEarned += weightedContribution;
        course.gradedWeightTotal += weight;
        course.hasGrades = true;
      }
    });

    const courses = Array.from(courseMap.values()).map((course) => {
      const average =
        course.gradedWeightTotal > 0
          ? (course.weightedEarned / course.gradedWeightTotal) * 100
          : 0;

      return {
        course_id: course.course_id,
        course_code: course.course_code,
        course_name: course.course_name,
        term: course.term,
        section: course.section,
        average: Number(average.toFixed(2)),
        hasGrades: course.hasGrades
      };
    });

    const gradedCourses = courses.filter((course) => course.hasGrades);
    const overallAverage =
      gradedCourses.length > 0
        ? Number(
            (
              gradedCourses.reduce(
                (sum, course) => sum + Number(course.average || 0),
                0
              ) / gradedCourses.length
            ).toFixed(2)
          )
        : 0;

    res.json({
      courses,
      overallAverage
    });
  });
});

// GET assessments by course for one enrolled student only
router.get("/:studentId/:courseId", (req, res) => {
  const { studentId, courseId } = req.params;

  const sql = `
    SELECT
      a.id,
      a.course_id,
      a.title,
      a.category,
      a.weight,
      a.total_marks,
      a.due_date,
      COALESCE(sa.earned_marks, 0) AS earned_marks,
      COALESCE(sa.status, 'Pending') AS status,
      sub.submitted_at,
      COALESCE(sub.status, 'Not Submitted') AS submission_status
    FROM student_courses sc
    INNER JOIN assessments a
      ON a.course_id = sc.course_id
    LEFT JOIN student_assessments sa
      ON sa.assessment_id = a.id
      AND sa.student_id = sc.student_id
    LEFT JOIN assessment_submissions sub
      ON sub.assessment_id = a.id
      AND sub.student_id = sc.student_id
    WHERE sc.student_id = ? AND sc.course_id = ?
    ORDER BY a.id DESC
  `;

  db.query(sql, [studentId, courseId], (err, results) => {
    if (err) {
      console.error("Get student assessments error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

// SUBMIT one assessment for one student
router.post("/:assessmentId/submit", (req, res) => {
  const { assessmentId } = req.params;
  const { student_id } = req.body;

  if (!student_id) {
    return res.status(400).json({ error: "Missing student_id" });
  }

  const checkSql = `
    SELECT
      a.id,
      a.due_date,
      sc.student_id
    FROM assessments a
    INNER JOIN student_courses sc
      ON sc.course_id = a.course_id
    WHERE a.id = ? AND sc.student_id = ?
  `;

  db.query(checkSql, [assessmentId, student_id], (checkErr, checkResults) => {
    if (checkErr) {
      console.log("Check student assessment submit error:", checkErr);
      return res.status(500).json({ error: "Database error" });
    }

    if (checkResults.length === 0) {
      return res.status(400).json({ error: "Student is not enrolled in this assessment's course" });
    }

    const assessment = checkResults[0];

    let submissionStatus = "Submitted";

    if (assessment.due_date) {
      const today = new Date();
      const dueDate = new Date(assessment.due_date);

      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);

      if (today > dueDate) {
        submissionStatus = "Late";
      }
    }

    const upsertSql = `
      INSERT INTO assessment_submissions
        (student_id, assessment_id, status)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        submitted_at = CURRENT_TIMESTAMP,
        status = VALUES(status)
    `;

    db.query(upsertSql, [student_id, assessmentId, submissionStatus], (insertErr) => {
      if (insertErr) {
        console.log("Submit assessment error:", insertErr);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Assessment submitted successfully",
        assessment_id: Number(assessmentId),
        student_id,
        status: submissionStatus
      });
    });
  });
});


module.exports = router;