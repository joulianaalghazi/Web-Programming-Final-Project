const express = require("express");
const router = express.Router();
const db = require("../student_db");

function toSafeNumber(value, fallback = 0) {
  const n = parseFloat(String(value ?? "").replace("%", "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function toSafeCategory(value) {
  const allowed = ["Assignment", "Quiz", "Lab", "Project", "Exam"];
  return allowed.includes(value) ? value : "Assignment";
}

function normalizeGradeDistribution(gradeDistribution, templateId) {
  if (!Array.isArray(gradeDistribution)) return [];

  return gradeDistribution
    .filter(item => item && (item.category || item.title))
    .map(item => [
      templateId,
      String(item.title || item.category || "").trim(),
      toSafeCategory(String(item.category || "").trim()),
      toSafeNumber(item.weight, 0),
      toSafeNumber(item.total_marks, 0),
      item.due_offset_days === "" || item.due_offset_days === undefined || item.due_offset_days === null
        ? null
        : parseInt(item.due_offset_days, 10)
    ]);
}

// GET templates for one professor
// Returns:
// - all default templates (created_by IS NULL)
// - all templates created by this professor
router.get("/", (req, res) => {
  const createdBy = Number(req.query.created_by);

  if (!createdBy) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const templateSql = `
    SELECT
      id,
      title,
      description,
      created_by,
      created_at,
      visibility,
      CASE
        WHEN created_by IS NULL OR visibility = 'default' THEN 'default'
        ELSE 'custom'
        END AS source
    FROM course_templates
    WHERE created_by IS NULL OR created_by = ?
    ORDER BY created_by IS NULL DESC, id DESC
  `;

  db.query(templateSql, [createdBy], (err, templates) => {
    if (err) {
      console.log("Get templates error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (!templates.length) {
      return res.json([]);
    }

    const templateIds = templates.map(t => t.id);

    const assessmentSql = `
      SELECT
        id,
        template_id,
        title,
        category,
        weight,
        total_marks,
        due_offset_days
      FROM template_assessments
      WHERE template_id IN (?)
      ORDER BY id ASC
    `;

    db.query(assessmentSql, [templateIds], (assessmentErr, assessmentRows) => {
      if (assessmentErr) {
        console.log("Get template assessments error:", assessmentErr);
        return res.status(500).json({ error: "Database error" });
      }

      const mapped = templates.map(template => {
        const gradeDistribution = assessmentRows
          .filter(row => Number(row.template_id) === Number(template.id))
          .map(row => ({
            title: row.title,
            category: row.category,
            weight: row.weight,
            total_marks: row.total_marks,
            due_offset_days: row.due_offset_days
          }));

        return {
          id: template.id,
          title: template.title,
          description: template.description || "",
          created_by: template.created_by,
          created_at: template.created_at,
          visibility: template.visibility || "private",
          source: template.source,
          gradeDistribution
        };
      });

      res.json(mapped);
    });
  });
});

// GET one template by id
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const createdBy = Number(req.query.created_by);

  if (!createdBy) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const templateSql = `
    SELECT
      id,
      title,
      description,
      created_by,
      created_at,
      visibility,
      CASE
        WHEN created_by IS NULL THEN 'default'
        ELSE 'custom'
      END AS source
    FROM course_templates
    WHERE id = ?
      AND (created_by IS NULL OR created_by = ?)
    LIMIT 1
  `;

  db.query(templateSql, [id, createdBy], (err, results) => {
    if (err) {
      console.log("Get single template error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = results[0];

    const assessmentSql = `
      SELECT
        id,
        template_id,
        title,
        category,
        weight,
        total_marks,
        due_offset_days
      FROM template_assessments
      WHERE template_id = ?
      ORDER BY id ASC
    `;

    db.query(assessmentSql, [id], (assessmentErr, assessmentRows) => {
      if (assessmentErr) {
        console.log("Get single template assessments error:", assessmentErr);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        id: template.id,
        title: template.title,
        description: template.description || "",
        created_by: template.created_by,
        created_at: template.created_at,
        visibility: template.visibility || "private",
        source: template.source,
        gradeDistribution: assessmentRows.map(row => ({
          title: row.title,
          category: row.category,
          weight: row.weight,
          total_marks: row.total_marks,
          due_offset_days: row.due_offset_days
        }))
      });
    });
  });
});

// CREATE template
router.post("/", (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const createdBy = Number(req.body.created_by);
  const visibility = String(req.body.visibility || "private").trim().toLowerCase();
  const safeVisibility = ["default", "private", "shared"].includes(visibility) ? visibility : "private";
  const gradeDistribution = req.body.gradeDistribution;

  if (!title || !createdBy) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const templateSql = `
    INSERT INTO course_templates (title, description, created_by, visibility)
    VALUES (?, ?, ?, ?)
  `;

  db.query(templateSql, [title, description, createdBy, safeVisibility], (err, result) => {
    if (err) {
      console.log("Create template error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const templateId = result.insertId;
    const rows = normalizeGradeDistribution(gradeDistribution, templateId);

    if (!rows.length) {
      db.query(`DELETE FROM course_templates WHERE id = ?`, [templateId], () => {});
      return res.status(400).json({ error: "At least one valid template assessment is required" });
    }

    const assessmentSql = `
      INSERT INTO template_assessments
      (template_id, title, category, weight, total_marks, due_offset_days)
      VALUES ?
    `;

    db.query(assessmentSql, [rows], (assessmentErr) => {
      if (assessmentErr) {
        console.log("Create template assessments error:", assessmentErr);
        db.query(`DELETE FROM course_templates WHERE id = ?`, [templateId], () => {});
        return res.status(500).json({ error: "Database error" });
      }

      return res.status(201).json({
        message: "Template created successfully",
        id: templateId
      });
    });
  });
});

// UPDATE template
    router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const createdBy = Number(req.body.created_by);
  const visibility = String(req.body.visibility || "private").trim().toLowerCase();
  const safeVisibility = ["default", "private", "shared"].includes(visibility) ? visibility : "private";
  const gradeDistribution = req.body.gradeDistribution;

  if (!title || !createdBy) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const rows = normalizeGradeDistribution(gradeDistribution, id);

  if (!rows.length) {
    return res.status(400).json({ error: "At least one valid template assessment is required" });
  }

  const checkSql = `
    SELECT id, created_by, visibility
    FROM course_templates
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [id], (checkErr, checkResults) => {
    if (checkErr) {
      console.log("Check template ownership error:", checkErr);
      return res.status(500).json({ error: "Database error" });
    }

    if (checkResults.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = checkResults[0];
    const isDefaultTemplate =
      template.created_by === null || template.visibility === "default";

    if (isDefaultTemplate) {
      return res.status(403).json({ error: "Default templates cannot be edited" });
    }

    if (Number(template.created_by) !== createdBy) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updateSql = `
      UPDATE course_templates
      SET
        title = ?,
        description = ?,
        visibility = ?
      WHERE id = ? AND created_by = ?
    `;

    db.query(updateSql, [title, description, safeVisibility, id, createdBy], (updateErr) => {
      if (updateErr) {
        console.log("Update template error:", updateErr);
        return res.status(500).json({ error: "Database error" });
      }

      const deleteAssessmentSql = `
        DELETE FROM template_assessments
        WHERE template_id = ?
      `;

      db.query(deleteAssessmentSql, [id], (deleteErr) => {
        if (deleteErr) {
          console.log("Delete old template assessments error:", deleteErr);
          return res.status(500).json({ error: "Database error" });
        }

        const insertAssessmentSql = `
          INSERT INTO template_assessments
          (template_id, title, category, weight, total_marks, due_offset_days)
          VALUES ?
        `;

        db.query(insertAssessmentSql, [rows], (insertErr) => {
          if (insertErr) {
            console.log("Insert updated template assessments error:", insertErr);
            return res.status(500).json({ error: "Database error" });
          }

          return res.json({
            message: "Template updated successfully",
            id
          });
        });
      });
    });
  });
});

// DELETE template
    router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const createdBy = Number(req.query.created_by);

  if (!createdBy) {
    return res.status(400).json({ error: "Missing created_by" });
  }

  const checkSql = `
    SELECT id, created_by, visibility
    FROM course_templates
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [id], (checkErr, checkResults) => {
    if (checkErr) {
      console.log("Check template before delete error:", checkErr);
      return res.status(500).json({ error: "Database error" });
    }

    if (checkResults.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = checkResults[0];

    const isDefaultTemplate =
      template.created_by === null || template.visibility === "default";

    const isOwnerTemplate =
      Number(template.created_by) === createdBy;

    if (!isDefaultTemplate && !isOwnerTemplate) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deleteSql = `
      DELETE FROM course_templates
      WHERE id = ?
    `;

    db.query(deleteSql, [id], (err, result) => {
      if (err) {
        console.log("Delete template error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Template not found" });
      }

      return res.json({ message: "Template deleted successfully" });
    });
  });
});

module.exports = router;