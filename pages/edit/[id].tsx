/*
 * Elijah Cobb
 * elijah@elijahcobb.com
 * https://elijahcobb.com
 */

import type {GetServerSideProps, NextPage} from "next";
import React, {useCallback, useEffect, useState} from "react";
import styles from "../../styles/App.module.scss";
import {Markdown} from "../../components/Markdown";
import {useDebounce, useInterval} from "../../components/hooks";
import moment from "moment";
import Head from "next/head";
import {Editor} from "../../components/Editor";
import {IAttachment, IFile, ISketch} from "../../components/local-types";
import {Analytics, Attachment, File, Sketch} from "../../db/DB";
import {getEmail, getUserForEmail} from "../../db/auth-silicon";
import {createSiID, SiQuery} from "@element-ts/silicon";
import {CircularProgress} from "@mui/material";
import {AttachmentManager} from "../../components/AttachmentManager";
import {EditorTopBar} from "../../components/editor/EditorTopBar";
import {EditorMode} from "../../components/editor/EditorModePicker";
import {Toast, ToastConfig} from "../../components/Toast";
import {Sketch as SketchEditor} from "../../components/editor/Sketch";

interface PageProps {
	file: IFile;
	images: IAttachment[];
	sketches: ISketch[];
}

export enum SaveStatus {
	Unsaved,
	Saved,
	Error
}


const Page: NextPage<PageProps> = props => {

	const [markdown, setMarkdown] = useState(props.file.content);
	const [name, setName] = useState(props.file.name);
	const [lastSaved, setLastSaved] = useState(Date.now());
	const [saveMessage, setSaveMessage] = useState("Fetched");
	const [darkMode, setDarkMode] = useState(false);
	const [status, setStatus] = useState<SaveStatus>(SaveStatus.Unsaved);
	const [mode, setMode] = useState<EditorMode>(EditorMode.SPLIT);
	const [academicTheme, setAcademicTheme] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [viewingSketches, setViewingSketches] = useState(false);
	const [viewingImages, setViewingImages] = useState(false);
	const [toast, setToast] = useState<ToastConfig | undefined>(undefined);
	const [sketching, setSketching] = useState<ISketch | null | undefined>(undefined);

	const [sketches, setSketches] = useState<ISketch[]>(props.sketches);
	const [images, setImages] = useState<IAttachment[]>(props.images);

	useEffect(() => {
		if (/Mobi|Android/i.test(navigator.userAgent)) setMode(EditorMode.PREVIEW);
		else setMode(window.innerWidth > 720 ? EditorMode.SPLIT : EditorMode.PREVIEW)
	}, []);
	useDebounce(save, 500, [markdown]);

	useInterval(() => {
		const a = moment(Date.now());
		const b = moment(lastSaved);
		setSaveMessage(b.from(a))
	}, 1000)

	useEffect(() => {
		setStatus(SaveStatus.Unsaved)
	}, [markdown])

	function save() {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", '/api/file/update', true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.onreadystatechange = function() {
			if (this.readyState === XMLHttpRequest.DONE) {
				// Request finished. Do processing here.
				if (this.status === 200) {
					setLastSaved(Date.now())
					setStatus(SaveStatus.Saved);
				} else {
					setStatus(SaveStatus.Error);
					alert("API responded with error: " + this.status)
				}
			}
		}
		xhr.send(JSON.stringify({
			content: markdown,
			id: props.file.id,
			name
		}));
	}

	function getModeColumns(): string {
		if (mode === EditorMode.SOURCE) return "100% 0%";
		else if (mode === EditorMode.PREVIEW) return "0% 100%";
		return "50% 50%";
	}

	const openFolder = () => {
		window.open("/view/" + props.file.parent, "_self")
	}

	const onOpenFile = useCallback(() => {
		const filePicker = document.getElementById("file") as HTMLInputElement | null;
		if (!filePicker) return;
		filePicker.click();
		filePicker.onchange = () => {
			const file = (filePicker.files ?? [])[0]
			if (file) {
				setUploading(true);
				const reader = new FileReader();
				reader.readAsDataURL(file);
				reader.onload = () => {
					const imageData = reader.result as string;
					const xhr = new XMLHttpRequest();
					xhr.open("POST", '/api/attachment/create', true);
					xhr.setRequestHeader("Content-Type", "application/json");
					xhr.onreadystatechange = function() {
						if (this.readyState === XMLHttpRequest.DONE) {
							// Request finished. Do processing here.
							if (this.status === 200) {
								const res = JSON.parse(this.responseText) as IAttachment;
								copyImageToClipboard(res);
								setUploading(false);
								setViewingImages(false);
								setImages(v => [...v, res]);
							} else {
								console.error(this.status, this.statusText)
								setToast({message: "Image upload to dotmd.app filed.", severity: "error"})
								setUploading(false);
							}
						}
					}
					xhr.send(JSON.stringify({
						content: imageData,
						id: props.file.id,
						mime: file.type
					}));

				};
				reader.onerror = function (error) {
					console.log('Error: ', error);
					setToast({message: "Failed to upload file data.", severity: "error"})
					setUploading(false);
				};
			}
		}
	}, [props.file.id])

	const copySketchToClipboard = (sketch: ISketch) => {
		navigator.clipboard.writeText(`![sketch](/api/sketch/view/${sketch.id})`).catch(console.error);
		setToast({message: "Copied to clipboard.", severity: "success"});
	}

	const copyImageToClipboard = (image: IAttachment) => {
		navigator.clipboard.writeText(`![image](/api/attachment/view/${image.id})`).catch(console.error);
		setToast({message: "Copied to clipboard.", severity: "success"});
	}

	return <div className={styles.App + " " + (darkMode ? styles.dark : "")}>
		<Head>
			<title>{name + ".md"}</title>
			<meta name="viewport" content="initial-scale=1.0, width=device-width" />
		</Head>
		{ uploading && <div className={styles.loading}>
			<div>
				<span>Uploading Image</span>
				<CircularProgress/>
			</div>
		</div>}
		<input accept={".png,.jpg,.jpeg,.gif"} id={"file"} type={"file"} style={{display: "none"}}/>
		<Toast
			config={toast}
			close={() => setToast(undefined)}
		/>
		{viewingSketches && <AttachmentManager
			files={sketches}
			onDelete={f => {
				const file = f as ISketch;
				window.open("/api/sketch/delete/" + file.id, "_self");
			}}
			onSelect={f => {
				const file = f as ISketch;
				setSketching(file);

			}}
			onCopy={f => {
				const file = f as ISketch;
				copySketchToClipboard(file);
			}}
			onNew={() => setSketching(null)}
			name={"Sketches"}
			onClose={() => setViewingSketches(false)}
		/>}
		{viewingImages && <AttachmentManager
			onDelete={f => {
				const file = f as IAttachment;
				window.open("/api/attachment/delete/" + file.id, "_self");
			}}
			onSelect={f => {
				const file = f as IAttachment;
				copyImageToClipboard(file);
			}}
			onCopy={f => {
				const file = f as IAttachment;
				copyImageToClipboard(file);
			}}
			files={images}
			onNew={() => {
				onOpenFile();
			}}
			name={"Images"}
			onClose={() => setViewingImages(false)}
		/>}
		{(sketching !== undefined) && <SketchEditor
			sketch={sketching}
			setToast={setToast}
			onClose={() => setSketching(undefined)}
			onSave={(data, copy) => {
				setUploading(true);
				const xhr = new XMLHttpRequest();
				let sketch = sketching;
				if (copy) sketch = null;
				xhr.open("POST", '/api/sketch/save', true);
				xhr.setRequestHeader("Content-Type", "application/json");
				xhr.onreadystatechange = function() {
					if (this.readyState === XMLHttpRequest.DONE) {
						setUploading(false);
						if (this.status === 200) {
							const res = JSON.parse(this.responseText) as ISketch;
							if (sketch?.id) window.open("/edit/" + props.file.id, "_self")
							copySketchToClipboard(res);
							setSketching(undefined);
							setViewingSketches(false);
							setSketches(v => [res, ...v.filter(i => i.id !== res.id)]);
						} else {
							console.error(this.status, this.statusText)
							setToast({message: "Sketch upload to dotmd.app filed.", severity: "error"})
						}
					}
				}
				xhr.send(JSON.stringify({
					id: sketch?.id,
					parent: props.file.id,
					svg: data.svg,
					paths: data.paths,
				}));
			}}
		/>}
		<EditorTopBar
			openFolder={openFolder}
			openImages={() => setViewingImages(true)}
			newImage={onOpenFile}
			openSketches={() => setViewingSketches(true)}
			newSketch={() => setSketching(null)}
			saveStatus={status}
			saveMessage={saveMessage}
			mode={mode}
			setMode={setMode}
			darkMode={darkMode}
			setDarkMode={setDarkMode}
			academicTheme={academicTheme}
			setAcademicTheme={setAcademicTheme}
			title={name}
			setTitle={setName}
			updateDoc={save}
		/>
		<div className={styles.container} style={{gridTemplateColumns: getModeColumns()}}>
			<Editor startTyping={() => setStatus(SaveStatus.Unsaved)} dark={darkMode} className={styles.editor} value={markdown} setValue={setMarkdown}/>
			<Markdown setToast={setToast} academicTheme={academicTheme} dark={darkMode} className={styles.markdown} value={markdown}/>
		</div>
	</div>
};

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {

	const fileId = context.query.id as string;
	const email = await getEmail(context);
	const user = await getUserForEmail(email);
	if (!user) return {redirect: {destination: "/", permanent: false}}

	const file = await SiQuery.getForId(File, createSiID(fileId));
	if (!file || file.get("owner").toHexString() !== user.getHexId()) return {redirect: {destination: "/", permanent: false}}

	await (new Analytics({
		user: user.getIdForce(),
		targetId: file.getIdForce(),
		targetType: "file",
		actionType: "view"
	})).save();

	const images = (await (new SiQuery(Attachment, {parent: file.getIdForce()})).getAll()).map(f => {
		return {
			...f.toJSON(),
			content: f.get("content").toString("base64")
		}
	});
	const sketches = (await (new SiQuery(Sketch, {parent: file.getIdForce()})).getAll()).map(f => {
		return {
			...f.toJSON(),
			svg: f.get("svg").toString("base64"),
			paths: f.get("paths").toString("utf-8")
		}
	});

	return {
		props: {file: file.toJSON(), images, sketches}
	}
}

// export const getStaticProps: GetStaticProps<PageProps> = async (context) => {
// 	return {
// 		props: {}
// 	}
// }

// export const getStaticPaths: GetStaticPaths = async () => {
// 	return {
// 		paths: [],
// 		fallback: false
// 	};
// }

export default Page;
