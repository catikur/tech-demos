import { useEffect, useRef } from "react";
import {
  CircleGeometry,
  Color,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SpotLight,
  WebGLRenderer,
  type BufferGeometry,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";

export type Mark = { prop: string; hit: boolean };

type Props = {
  hue: number;
  marks: Mark[];
  worldKey: string;
  onSnapshot: (shot: () => string) => void;
};

export function LifeWorld({ hue, marks, worldKey, onSnapshot }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const life = useRef<Group | null>(null);
  const camera = useRef<PerspectiveCamera | null>(null);
  const built = useRef(0);

  const shotSink = useRef(onSnapshot);
  shotSink.current = onSnapshot;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.fog = new Fog(0x17130f, 16, 36);
    const cam = new PerspectiveCamera(36, el.clientWidth / Math.max(el.clientHeight, 1), 0.1, 80);
    cam.position.set(5.2, 3.4, 7.2);
    cam.lookAt(0, 0.8, 0);
    camera.current = cam;

    scene.add(new HemisphereLight(0xfff4e4, 0x4a3428, 2.4));
    const spot = new SpotLight(0xffe0b0, 60, 48, 0.7, 0.4);
    spot.position.set(4, 12, 6);
    scene.add(spot);
    const rim = new SpotLight(0x9fd7ff, 30, 40, 0.8, 0.5);
    rim.position.set(-6, 5, -4);
    scene.add(rim);

    const ground = new Mesh(
      new CircleGeometry(9, 64),
      new MeshStandardMaterial({ color: 0x2a231c, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    for (const radius of [1.4, 2.3, 3.2]) {
      const guide = new Mesh(
        new TorusGeometry(radius, 0.012, 6, 48),
        new MeshStandardMaterial({ color: 0x5c5046, roughness: 0.8 }),
      );
      guide.rotation.x = Math.PI / 2;
      guide.position.y = 0.01;
      scene.add(guide);
    }

    const group = new Group();
    scene.add(group);
    life.current = group;
    built.current = 0;
    addPerson(group, hue);

    let frame = 0;
    const loop = (t: number) => {
      group.rotation.y = t * 0.00022;
      const person = group.getObjectByName("person");
      if (person) person.position.y = Math.sin(t * 0.002) * 0.05;
      for (const child of group.children) {
        const grow = child.userData.grow as number | undefined;
        if (grow !== undefined && grow < 1) {
          child.userData.grow = Math.min(1, grow + 0.06);
          const s = ease(child.userData.grow as number);
          child.scale.setScalar(s);
        }
      }
      renderer.render(scene, cam);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const resize = () => {
      if (!el) return;
      cam.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
      cam.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", resize);
    shotSink.current(() => renderer.domElement.toDataURL("image/png"));

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      life.current = null;
      camera.current = null;
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [worldKey, hue]);

  useEffect(() => {
    const group = life.current;
    const cam = camera.current;
    if (!group || !cam) return;
    while (built.current < marks.length) {
      const index = built.current;
      const mark = marks[index]!;
      const prop = makeProp(mark.prop, mark.hit, hue);
      const angle = index * 0.95 + 0.4;
      const radius = 1.15 + (index % 3) * 0.28;
      prop.position.set(Math.sin(angle) * radius, 0.25 + index * 0.48, Math.cos(angle) * radius);
      prop.scale.setScalar(0.04);
      prop.userData.grow = 0;
      group.add(prop);

      const ring = new Mesh(
        new TorusGeometry(1.05 + index * 0.34, 0.025, 6, 40),
        new MeshStandardMaterial({
          color: mark.hit ? new Color(`hsl(${hue}, 70%, 58%)`) : 0x3a332c,
          roughness: 0.45,
          metalness: 0.15,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      group.add(ring);
      built.current += 1;
    }
    const dist = 6.4 + marks.length * 0.38;
    cam.position.set(dist * 0.62, 3.1 + marks.length * 0.22, dist);
    cam.lookAt(0, 0.7 + marks.length * 0.08, 0);
  }, [marks, hue]);

  return <div className="world" ref={host} />;
}

function ease(t: number): number {
  return 1 - (1 - t) ** 3;
}

function addPerson(group: Group, hue: number) {
  const person = new Group();
  person.name = "person";
  const cloth = new MeshStandardMaterial({ color: new Color(`hsl(${hue}, 45%, 62%)`), roughness: 0.55 });
  const skin = new MeshStandardMaterial({ color: 0xf0d2b4, roughness: 0.7 });
  const head = new Mesh(new IcosahedronGeometry(0.28, 0), skin);
  head.position.y = 1.35;
  const body = new Mesh(new CylinderGeometry(0.16, 0.24, 0.62, 6), cloth);
  body.position.y = 0.86;
  const legL = new Mesh(new BoxGeometry(0.1, 0.46, 0.1), cloth);
  legL.position.set(-0.1, 0.32, 0);
  const legR = legL.clone();
  legR.position.x = 0.1;
  person.add(head, body, legL, legR);
  group.add(person);
}

function makeProp(kind: string, hit: boolean, hue: number): Mesh {
  const color = hit ? new Color(`hsl(${hue}, 72%, 58%)`) : new Color("#6a5c50");
  const material = new MeshStandardMaterial({
    color,
    roughness: hit ? 0.35 : 0.85,
    metalness: hit ? 0.25 : 0,
    flatShading: true,
  });
  const geometry = geometryFor(kind);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

function geometryFor(kind: string): BufferGeometry {
  switch (kind) {
    case "ball":
      return new IcosahedronGeometry(0.28, 0);
    case "boot":
      return new BoxGeometry(0.42, 0.16, 0.22);
    case "trophy":
      return new ConeGeometry(0.22, 0.48, 5);
    case "laptop":
      return new BoxGeometry(0.46, 0.06, 0.3);
    case "chart":
      return new OctahedronGeometry(0.28, 0);
    case "certificate":
      return new BoxGeometry(0.36, 0.46, 0.04);
    case "contract":
      return new BoxGeometry(0.32, 0.4, 0.05);
    case "medal":
      return new CylinderGeometry(0.16, 0.16, 0.06, 8);
    case "hoop":
      return new TorusGeometry(0.24, 0.04, 6, 16);
    case "mic":
      return new CylinderGeometry(0.06, 0.08, 0.42, 6);
    case "podium":
      return new BoxGeometry(0.46, 0.28, 0.28);
    case "seal":
      return new CylinderGeometry(0.18, 0.18, 0.08, 6);
    case "coin":
      return new CylinderGeometry(0.16, 0.16, 0.05, 7);
    case "door":
      return new BoxGeometry(0.28, 0.5, 0.06);
    case "street":
      return new BoxGeometry(0.5, 0.08, 0.5);
    case "lamp":
      return new SphereGeometry(0.16, 6, 5);
    case "star":
      return new OctahedronGeometry(0.26, 0);
    case "whistle":
      return new DodecahedronGeometry(0.18, 0);
    case "desk":
      return new BoxGeometry(0.5, 0.1, 0.28);
    case "flag":
      return new ConeGeometry(0.08, 0.46, 4);
    case "crack":
      return new DodecahedronGeometry(0.22, 0);
    default:
      return new BoxGeometry(0.28, 0.28, 0.28);
  }
}
