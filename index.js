const { execSync } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

const log = (msg) => console.log(`\n${msg}`); // eslint-disable-line no-console

const exit = (msg) => {
	console.error(msg);
	process.exit(1);
};

const run = (cmd, cwd) => execSync(cmd, { encoding: "utf8", stdio: "inherit", cwd });

const getPlatform = () => {
	switch (process.platform) {
		case "darwin":
			return "mac";
		case "win32":
			return "windows";
		default:
			return "linux";
	}
};

const getEnv = (name) => process.env[name.toUpperCase()] || null;

const setEnv = (name, value) => {
	if (value) {
		process.env[name.toUpperCase()] = value.toString();
	}
};

const getInput = (name, required) => {
	const value = getEnv(`INPUT_${name}`);
	if (required && !value) {
		exit(`"${name}" input variable is not defined`);
	}
	return value;
};

const runAction = () => {
	const platform = getPlatform();
	const release = getInput("release", true) === "true";
	const pkgRoot = getInput("package_root", true);
	const buildScriptName = getInput("build_script_name", true);
	const skipBuild = getInput("skip_build") === "true";
	const args = getInput("args") || "";
	const maxAttempts = Number(getInput("max_attempts") || "1");

	const appRoot = getInput("app_root") || pkgRoot;

	const pkgJsonPath = join(pkgRoot, "package.json");
	const pkgLockPath = join(pkgRoot, "package-lock.json");

	const useNpm = existsSync(pkgLockPath);
	log(`Will run ${useNpm ? "NPM" : "Yarn"} commands in directory "${pkgRoot}"`);

	if (!existsSync(pkgJsonPath)) {
		exit(`\`package.json\` file not found at path "${pkgJsonPath}"`);
	}

	setEnv("GH_TOKEN", getInput("github_token", true));

	if (platform === "mac") {
		setEnv("CSC_LINK", getInput("mac_certs"));
		setEnv("CSC_KEY_PASSWORD", getInput("mac_certs_password"));
	} else if (platform === "windows") {
		setEnv("CSC_LINK", getInput("windows_certs"));
		setEnv("CSC_KEY_PASSWORD", getInput("windows_certs_password"));
	}

	setEnv("ADBLOCK", true);

	log(`Installing dependencies using ${useNpm ? "NPM" : "Yarn"}…`);
	run(useNpm ? "npm install" : "yarn", pkgRoot);

	if (skipBuild) {
		log("Skipping build script because `skip_build` option is set");
	} else {
		log("Running the build script…");
		if (useNpm) {
			run(`npm run ${buildScriptName} --if-present`, pkgRoot);
		} else {
			const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
			if (pkgJson.scripts && pkgJson.scripts[buildScriptName]) {
				run(`yarn run ${buildScriptName}`, pkgRoot);
			}
		}
	}

	log(`Building${release ? " and releasing" : ""} the Electron app…`);
	for (let i = 0; i < maxAttempts; i += 1) {
		try {
			run(`${useNpm ? "npx --no-install" : "yarn run"} electron-builder --${platform} --publish always`, appRoot);
			break;
		} catch (err) {
			if (i < maxAttempts - 1) {
				log(`Attempt ${i + 1} failed:`);
				log(err);
			} else {
				throw err;
			}
		}
	}
};

runAction();
