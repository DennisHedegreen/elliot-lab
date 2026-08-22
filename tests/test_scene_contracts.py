from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_scene(name: str) -> dict[str, object]:
    return json.loads((ROOT / "scenes" / name).read_text(encoding="utf-8"))


def pure_module_graph(scene: dict[str, object]) -> dict[str, object]:
    components = [
        component
        for component in scene["components"]
        if component["type"] not in {"source", "output_basin"}
    ]
    component_ids = {component["id"] for component in components}
    routes = [
        route
        for route in scene["connections"]
        if route["from_component"] in component_ids and route["to_component"] in component_ids
    ]
    return {
        "components": components,
        "routes": routes,
    }


class SceneContractTests(unittest.TestCase):
    def test_multi_io_scene_declares_explicit_public_boundary(self) -> None:
        scene = load_scene("multi-io-threshold-router.scene.json")
        interface = scene["module_interface_draft"]

        self.assertEqual(len(interface["inputs"]), 2)
        self.assertEqual(len(interface["outputs"]), 2)

        component_by_id = {component["id"]: component for component in scene["components"]}
        for entry in interface["inputs"]:
            bound_component = component_by_id[entry["component_id"]]
            self.assertEqual(bound_component["type"], "bucket")
            self.assertEqual(entry["port_id"], "in")
        for entry in interface["outputs"]:
            bound_component = component_by_id[entry["component_id"]]
            self.assertEqual(bound_component["type"], "bucket")
            self.assertEqual(entry["port_id"], "out")

    def test_multi_io_export_boundary_strips_lab_harness(self) -> None:
        scene = load_scene("multi-io-threshold-router.scene.json")
        graph = pure_module_graph(scene)

        self.assertEqual(
            {component["id"] for component in graph["components"]},
            {"bucket-left", "bucket-right"},
        )
        self.assertEqual(graph["routes"], [])
        self.assertNotIn("source", {component["type"] for component in graph["components"]})
        self.assertNotIn("output_basin", {component["type"] for component in graph["components"]})

    def test_all_example_scene_files_are_valid_json_objects(self) -> None:
        for path in sorted((ROOT / "scenes").glob("*.scene.json")):
            with self.subTest(scene=path.name):
                scene = json.loads(path.read_text(encoding="utf-8"))
                self.assertIsInstance(scene, dict)
                self.assertIsInstance(scene.get("components"), list)
                self.assertIsInstance(scene.get("connections"), list)


if __name__ == "__main__":
    unittest.main()
