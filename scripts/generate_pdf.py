import os
import subprocess
import markdown

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BROWSER_PATH = EDGE_PATH if os.path.exists(EDGE_PATH) else CHROME_PATH

CSS_TEMPLATE = """
@page {
  size: A4;
  margin: 18mm 16mm 18mm 16mm;
}

* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1e293b;
  background: #ffffff;
  margin: 0;
  padding: 0;
}

.doc-header {
  border-bottom: 2px solid #4f46e5;
  padding-bottom: 14px;
  margin-bottom: 24px;
}

.doc-header .meta-badge {
  display: inline-block;
  font-size: 8.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #eef2ff;
  color: #4f46e5;
  padding: 3px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.doc-header h1 {
  font-size: 22pt;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 6px 0;
  line-height: 1.2;
}

.doc-header .doc-subtitle {
  font-size: 11pt;
  color: #64748b;
  margin: 0 0 10px 0;
}

.doc-header .doc-meta {
  font-size: 9pt;
  color: #64748b;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.doc-header .doc-meta span strong {
  color: #334155;
}

h1, h2, h3, h4 {
  color: #0f172a;
  page-break-after: avoid;
  page-break-inside: avoid;
}

h2 {
  font-size: 14pt;
  font-weight: 700;
  margin-top: 24px;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid #e2e8f0;
  color: #1e1b4b;
}

h3 {
  font-size: 12pt;
  font-weight: 600;
  margin-top: 18px;
  margin-bottom: 8px;
  color: #312e81;
}

p, ul, ol {
  margin-top: 0;
  margin-bottom: 10px;
}

ul, ol {
  padding-left: 20px;
}

li {
  margin-bottom: 4px;
}

code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 9pt;
  background: #f1f5f9;
  color: #0f172a;
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

pre {
  background: #0f172a;
  color: #f8fafc;
  padding: 12px 14px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 8.5pt;
  line-height: 1.45;
  overflow-x: auto;
  page-break-inside: avoid;
  margin: 12px 0;
}

pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  border: none;
  font-size: inherit;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 9.5pt;
  page-break-inside: auto;
}

tr {
  page-break-inside: avoid;
  page-break-after: auto;
}

thead th {
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 700;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  font-size: 9pt;
}

tbody td {
  padding: 7px 10px;
  border: 1px solid #e2e8f0;
  vertical-align: top;
}

tbody tr:nth-child(even) {
  background: #f8fafc;
}

blockquote {
  border-left: 3px solid #4f46e5;
  background: #f8fafc;
  margin: 12px 0;
  padding: 8px 14px;
  color: #475569;
  font-size: 10pt;
}

hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 20px 0;
}

.footer-print {
  margin-top: 30px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 8.5pt;
  color: #94a3b8;
  display: flex;
  justify-content: space-between;
}
"""

def generate_pdf(md_path, pdf_path, subtitle):
    with open(md_path, "r", encoding="utf-8") as f:
        md_content = f.read()

    # Extraire le premier H1 pour le header
    lines = md_content.splitlines()
    doc_title = "Spécification"
    filtered_lines = []
    for line in lines:
        if line.startswith("# ") and doc_title == "Spécification":
            doc_title = line.replace("# ", "").strip()
        else:
            filtered_lines.append(line)

    body_html = markdown.markdown(
        "\n".join(filtered_lines),
        extensions=["tables", "fenced_code", "toc"]
    )

    full_html = f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>{doc_title}</title>
  <style>{CSS_TEMPLATE}</style>
</head>
<body>
  <div class="doc-header">
    <div class="meta-badge">Livrable Universitaire · BUT 3 Informatique</div>
    <h1>{doc_title}</h1>
    <div class="doc-subtitle">{subtitle}</div>
    <div class="doc-meta">
      <span><strong>Projet :</strong> TaskFlow (TD1 / SaaS Kanban)</span>
      <span><strong>Auteur :</strong> Alexis Poncey Valdemar</span>
      <span><strong>Date :</strong> Novembre 2026</span>
      <span><strong>Version :</strong> 1.0 (Partie I)</span>
    </div>
  </div>

  <div class="content">
    {body_html}
  </div>

  <div class="footer-print">
    <span>TaskFlow — Spécifications du projet</span>
    <span>IUT d'Amiens · BUT 3 Informatique</span>
  </div>
</body>
</html>"""

    temp_html = md_path.replace(".md", ".temp.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(full_html)

    abs_html = os.path.abspath(temp_html)
    abs_pdf = os.path.abspath(pdf_path)

    import tempfile
    user_data_dir = tempfile.mkdtemp()

    cmd = [
        BROWSER_PATH,
        "--headless",
        "--disable-gpu",
        f"--user-data-dir={user_data_dir}",
        "--no-pdf-header-footer",
        f"--print-to-pdf={abs_pdf}",
        f"file:///{abs_html.replace(os.sep, '/')}"
    ]

    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if os.path.exists(temp_html):
        os.remove(temp_html)
    import shutil
    shutil.rmtree(user_data_dir, ignore_errors=True)

    if os.path.exists(abs_pdf) and os.path.getsize(abs_pdf) > 0:
        print(f"OK: {pdf_path} généré avec succès ({os.path.getsize(abs_pdf)} octets)")
    else:
        print(f"ERREUR: Échec de génération pour {pdf_path}. Code: {res.returncode}")
        print("Stdout:", res.stdout)
        print("Stderr:", res.stderr)

if __name__ == "__main__":
    generate_pdf(
        "docs/SPECIFICATION_FONCTIONNELLE.md",
        "docs/SPECIFICATION_FONCTIONNELLE.pdf",
        "Description complète des fonctionnalités, rôles, parcours utilisateurs et règles de gestion"
    )
    generate_pdf(
        "docs/SPECIFICATION_TECHNIQUE.md",
        "docs/SPECIFICATION_TECHNIQUE.pdf",
        "Architecture logicielle, modèle de données MongoDB, isolation multi-tenant et dimensionnement"
    )
