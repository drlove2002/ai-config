{
  description = "Build pocket-tts-cli from source (CPU-only, ungated weights)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.rustPlatform.buildRustPackage {
          pname = "pocket-tts-cli";
          version = "0.1.0";

          src = pkgs.fetchFromGitHub {
            owner = "PocketVTuber";
            repo = "pocket-tts-cli";
            rev = "b6369a24";
            hash = "sha256-nkE+PfntAXWm3z7k3q8CVP0/d7OzvIPsyQCyvOzLz5I=";
          };

          cargoHash = "sha256-aOTlQHwjDDJ3hPLCM7+iKbddjjMM8FbOjR2SMDdjj68=";

          nativeBuildInputs = with pkgs; [ pkg-config ];

          buildInputs = with pkgs; [
            openssl
            alsa-lib
          ];

          # CPU-only: remove GPU-specific features
          buildNoDefaultFeatures = true;

          postPatch = ''
            # Use ungated weights (no HuggingFace auth needed)
            for cfg in crates/pocket-tts/config/*.yaml; do
              sed -i '/^weights_path:/d' "$cfg"
              sed -i 's/^weights_path_without_voice_cloning:/weights_path:/' "$cfg"
            done
          '';

          postInstall = ''
            # Wrap binary so config files resolve relative to $out
            mkdir -p $out/config
            cp crates/pocket-tts/config/*.yaml $out/config/
            wrapProgram $out/bin/pocket-tts-cli \
              --chdir $out
          '';

          doCheck = false;
        };
      }
    );
}
