---
title: Understanding Existing Code with AI DevKit
description: Learn how to analyze and document existing codebases using AI DevKit's capture-knowledge command
order: 4
---

## Use `/capture-knowledge` for Code Analysis

When working with existing codebases, the `/capture-knowledge` command helps you understand complex systems by analyzing code from any entry point and generating comprehensive documentation with visual diagrams.

```bash
# In Cursor
/capture-knowledge <entry-point> [options]

# In Claude Code  
Use the capture-knowledge command to analyze <entry-point>
```

### Entry Point Types

**Files:**
```bash
/capture-knowledge src/api/users.ts
```
Analyzes a specific file and its dependencies.

**Folders:**
```bash
/capture-knowledge src/services/
```
Analyzes an entire module or directory structure.

**Functions:**
```bash
/capture-knowledge calculateTotalPrice
```
Analyzes a specific function and its call chain.

**API Endpoints:**
```bash
/capture-knowledge POST:/api/users
```
Analyzes complete API request/response flow.

### What You Get

**Detailed Explanations**
- Natural language descriptions of how code works
- Implementation details and design patterns
- Logic flow and component relationships

**Recursive Analysis**
- Automatically traces all dependencies
- Maps complete execution paths
- Identifies external integrations

**Visual Diagrams**
- Flowcharts showing execution paths
- Sequence diagrams for API flows
- Architecture diagrams for modules
- Component relationship maps

**Actionable Insights**
- Performance considerations
- Security implications
- Potential improvements
- Refactoring opportunities

### Use Cases

- **Onboarding** - Help new developers understand complex systems
- **Documentation** - Generate comprehensive system documentation
- **Debugging** - Understand complete execution flows
- **Refactoring** - Get full context before making changes
- **Knowledge Base** - Create searchable documentation

**Output Location:** Analysis is saved to `docs/ai/knowledge/` and can be versioned with your code.