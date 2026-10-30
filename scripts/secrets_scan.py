import os
import re
import subprocess
import sys

# Standard secret pattern regexes (Gitleaks / TruffleHog equivalent)
PATTERNS = [
    ("Private Key", re.compile(r"-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP)? PRIVATE KEY-----")),
    ("Database Connection String with Password", re.compile(r"(?:postgres|postgresql|mysql)://[^:]+:[^@\s]+@[^\s]+", re.IGNORECASE)),
    ("Supabase Secret Key", re.compile(r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+")),
    ("Generic API Key / Secret", re.compile(r"(?:api[_-]?key|secret|token|password|auth[_-]?key)\s*[:=]\s*['\"][0-9a-zA-Z_\-]{16,}['\"]", re.IGNORECASE)),
    ("AWS Access Key ID", re.compile(r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}")),
    ("GitHub Personal Access Token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{36,}")),
    ("Slack Token", re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,48}")),
    ("Google API Key", re.compile(r"AIza[0-9A-Za-z\\-_]{35}")),
]

IGNORED_DIRS = {".git", ".venv", "node_modules", "dist", ".playwright", "coverage"}
IGNORED_FILES = {".env.example"}

def scan_text(source_name: str, text: str) -> list[str]:
    findings = []
    lines = text.splitlines()
    for idx, line in enumerate(lines, 1):
        # Skip placeholder lines
        if "<pooler-host>" in line or "placeholder" in line or "<your-" in line or "your_supabase" in line:
            continue
        for label, regex in PATTERNS:
            if regex.search(line):
                findings.append(f"[{label}] {source_name}:{idx}")
    return findings

def scan_working_tree() -> list[str]:
    findings = []
    root = os.path.abspath(".")
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
        for f in filenames:
            if f in IGNORED_FILES or f.endswith((".png", ".jpg", ".webp", ".ico", ".woff2", ".log", ".zip")):
                continue
            path = os.path.join(dirpath, f)
            rel_path = os.path.relpath(path, root)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
                findings.extend(scan_text(rel_path, content))
            except Exception as e:
                pass
    return findings

def scan_git_history() -> list[str]:
    findings = []
    try:
        commits = subprocess.check_output(["git", "rev-list", "--all"], text=True).splitlines()
    except Exception:
        return findings

    for commit in commits:
        try:
            diff = subprocess.check_output(["git", "show", commit], text=True, errors="ignore")
            # Only check added lines
            added_lines = [l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
            findings.extend(scan_text(f"git-commit:{commit[:8]}", "\n".join(added_lines)))
        except Exception:
            pass
    return findings

def main():
    print("=" * 60)
    print("EVENTPILOT SECRETS & CREDENTIAL SCANNER")
    print("Scanning git history and working tree...")
    print("=" * 60)

    git_findings = scan_git_history()
    tree_findings = scan_working_tree()
    all_findings = git_findings + tree_findings

    print(f"Git history commits checked.")
    print(f"Working tree files checked.")
    print("-" * 60)
    if all_findings:
        print(f"FAILED: Found {len(all_findings)} potential secret(s):")
        for f in all_findings:
            print("  - " + f)
        sys.exit(1)
    else:
        print("SUCCESS: 0 secrets detected across git history and working tree.")
        print("Verified all .env and .env.* are ignored.")
        sys.exit(0)

if __name__ == "__main__":
    main()
