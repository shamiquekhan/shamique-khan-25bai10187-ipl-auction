import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Self-hosted fonts (latin subsets only) — the LAN deployment has no internet.
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "./styles/tokens.css";

import Landing from "./pages/Landing.js";
import Board from "./pages/Board.js";
import Team from "./pages/Team.js";
import Admin from "./pages/Admin.js";
import Squads from "./pages/Squads.js";
import StateGallery from "./pages/StateGallery.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/board" element={<Board />} />
        <Route path="/team" element={<Team />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/squads" element={<Squads />} />
        <Route path="/dev/states" element={<StateGallery />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
