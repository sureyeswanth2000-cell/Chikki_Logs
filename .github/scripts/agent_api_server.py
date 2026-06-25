import os
import tarfile
import tempfile
import json
import secrets
import threading
from pyngrok import ngrok
from flask import Flask, request, jsonify
import requests
import re

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5-coder:0.5b" # You can change this to llama3, mistral, codellama, etc.
PORT = 5000

app = Flask(__name__)
AUTH_TOKEN = "chikki-agent-static-token-9f8d7e6c"

def generate_diff(prompt, repo_dir):
    """
    Reads the repo, prepares a prompt, and asks Ollama to generate a diff.
    """
    # Read the MVP blueprint and current repo files to give Ollama context
    context = ""
    
    blueprint_path = os.path.join(repo_dir, "MVP_Blueprint_v1.md")
    if os.path.exists(blueprint_path):
        with open(blueprint_path, 'r', encoding='utf-8') as f:
            context += f"\n--- MVP_Blueprint_v1.md ---\n{f.read()}\n"
            
    # Read other small project files to give context
    for root, dirs, files in os.walk(repo_dir):
        if ".git" in root or "node_modules" in root or "__pycache__" in root:
            continue
        for file in files:
            if file.endswith(('.js', '.py', '.html', '.css', '.md', '.json', '.yml')):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, repo_dir)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if len(context) < 50000: # Rough context limit
                            context += f"\n--- {rel_path} ---\n{content}\n"
                except Exception:
                    pass

    full_prompt = f"""You are an autonomous AI Agent building a project based on an MVP Blueprint.
Here is the current state of the repository:
{context}

The user's prompt for this iteration is:
{prompt}

Your task is to decide what code needs to be added, modified, or deleted next to progress the project.
Output your changes EXCLUSIVELY as a valid unified diff (git patch format) inside a ```diff codeblock. 
Do not output anything else outside the code block, except maybe a brief summary.
Ensure the diff uses correct relative paths (a/filename and b/filename).

Example format:
```diff
--- a/src/index.js
+++ b/src/index.js
@@ -1,3 +1,4 @@
 console.log("Hello");
+console.log("World");
```
"""
    
    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": False
    }

    print("Sending prompt to Ollama...")
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=300)
        response.raise_for_status()
        result = response.json().get("response", "")
        
        # Extract the diff from the markdown codeblock
        diff_match = re.search(r'```diff\s*(.*?)\s*```', result, re.DOTALL)
        patch = diff_match.group(1).strip() if diff_match else ""
        
        summary = "Applied updates based on the prompt."
        if patch == "":
             print("Warning: No diff found in the response. Full response was:")
             print(result)
             summary = "No changes generated."
             
        return patch, summary, result
    except Exception as e:
        print(f"Error communicating with Ollama: {e}")
        return "", f"Error: {e}", str(e)


@app.before_request
def check_auth():
    auth_header = request.headers.get("Authorization")
    expected_header = f"Bearer {AUTH_TOKEN}"
    if not auth_header or auth_header != expected_header:
        return jsonify({"error": "Unauthorized"}), 401

@app.route("/", methods=["POST"])
def handle_webhook():
    metadata_file = request.files.get("metadata")
    repo_archive = request.files.get("repo_archive")
    
    if not metadata_file or not repo_archive:
        return jsonify({"error": "Missing files"}), 400

    metadata = json.loads(metadata_file.read().decode('utf-8'))
    prompt = metadata.get("prompt", "")
    iteration = metadata.get("iteration", 1)
    
    print(f"\n[Iteration {iteration}] Received request from GitHub Actions.")

    with tempfile.TemporaryDirectory() as temp_dir:
        archive_path = os.path.join(temp_dir, "repo.tar.gz")
        repo_archive.save(archive_path)
        
        # Extract archive
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path=temp_dir)
            
        # Run Ollama logic
        patch, summary, full_response = generate_diff(prompt, temp_dir)
        
        # Determine if we are done (basic logic for now)
        done = False
        if patch == "":
            done = True # Stop if the agent couldn't generate a patch
            
        # Return response expected by GitHub runner
        response_data = {
            "done": done,
            "patch": patch,
            "next_prompt": prompt, # Keep the same overarching prompt, or you could use Ollama to generate a new sub-prompt
            "session_url": "Agent running in VM",
            "summary": summary
        }
        
        print(f"[Iteration {iteration}] Returning patch. Done: {done}")
        return jsonify(response_data)

def start_ngrok():
    ngrok.set_auth_token("3Fc9gJIBs7lKjrP9INkXAw2ZhFD_379yBjD1Af7w9Gyi5wAmZ")
    public_url = ngrok.connect(PORT, domain="apple-barrier-slip.ngrok-free.dev")
    print("\n" + "="*50)
    print("=== ADD THESE TO GITHUB SECRETS ===")
    print(f"COLAB_API_URL: {public_url.public_url}")
    print(f"COLAB_API_TOKEN: {AUTH_TOKEN}")
    print("="*50 + "\n")

if __name__ == "__main__":
    # Start ngrok in a separate thread so it doesn't block Flask startup
    threading.Thread(target=start_ngrok).start()
    print("Starting Flask server...")
    app.run(port=PORT, host="0.0.0.0")
